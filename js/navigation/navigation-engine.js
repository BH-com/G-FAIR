/* FINDER modular section: navigation. Load order is defined in admin.html and index.html. */
function buildClearanceMap() {
  if (!gridMap) return null;
  const rows = gridMap.rows, cols = gridMap.cols;
  const dist = Array.from({ length: rows + 1 }, () => new Int16Array(cols + 1));
  const q = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      if (!isWalkable(r, c)) { dist[r][c] = 0; q.push([r,c]); }
      else dist[r][c] = 32767;
    }
  }
  let h=0;
  const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
  while(h<q.length){
    const [r,c]=q[h++];
    for(const [dr,dc] of dirs){
      const nr=r+dr,nc=c+dc;
      if(nr<1||nr>rows||nc<1||nc>cols) continue;
      if(dist[nr][nc]>dist[r][c]+1){dist[nr][nc]=dist[r][c]+1;q.push([nr,nc]);}
    }
  }
  return dist;
}

function contiguousRun(row,col,dr,dc){
  let r1=row,c1=col,r2=row,c2=col;
  while(isWalkable(r1-dr,c1-dc)){r1-=dr;c1-=dc;}
  while(isWalkable(r2+dr,c2+dc)){r2+=dr;c2+=dc;}
  return {r1,c1,r2,c2,length:Math.abs(r2-r1)+Math.abs(c2-c1)+1};
}

// 클릭한 좌표를 기준으로 현재 복도의 중앙선에만 스냅한다.
// 긴 복도 방향의 좌표는 유지하고, 복도 폭 방향만 중앙으로 보정한다.
function snapToCorridorCenter(row, col) {
  if (!isWalkable(row, col)) return null;

  /*
   * 클릭한 점 주변에서 복도의 '폭'만 조사합니다.
   * 복도의 길이 방향 좌표는 변경하지 않습니다.
   */

  const MAX_WIDTH_SCAN = 20;

  function verticalWidthAt(r, c) {
    let top = r;
    let bottom = r;

    for (let i = 0; i < MAX_WIDTH_SCAN; i++) {
      if (!isWalkable(top - 1, c)) break;
      top--;
    }

    for (let i = 0; i < MAX_WIDTH_SCAN; i++) {
      if (!isWalkable(bottom + 1, c)) break;
      bottom++;
    }

    return {
      min: top,
      max: bottom,
      length: bottom - top + 1
    };
  }

  function horizontalWidthAt(r, c) {
    let left = c;
    let right = c;

    for (let i = 0; i < MAX_WIDTH_SCAN; i++) {
      if (!isWalkable(r, left - 1)) break;
      left--;
    }

    for (let i = 0; i < MAX_WIDTH_SCAN; i++) {
      if (!isWalkable(r, right + 1)) break;
      right++;
    }

    return {
      min: left,
      max: right,
      length: right - left + 1
    };
  }

  const vertical = verticalWidthAt(row, col);
  const horizontal = horizontalWidthAt(row, col);

  const centerRow = Math.round((vertical.min + vertical.max) / 2);
  const centerCol = Math.round((horizontal.min + horizontal.max) / 2);

  /*
   * 가로 복도:
   * 클릭한 열(col)은 그대로 두고 행(row)만 중앙 보정
   */
  if (horizontal.length > vertical.length) {
    const snapped = {
      row: centerRow,
      col: col
    };

    if (isWalkable(snapped.row, snapped.col)) {
      return snapped;
    }
  }

  /*
   * 세로 복도:
   * 클릭한 행(row)은 그대로 두고 열(col)만 중앙 보정
   */
  if (vertical.length > horizontal.length) {
    const snapped = {
      row: row,
      col: centerCol
    };

    if (isWalkable(snapped.row, snapped.col)) {
      return snapped;
    }
  }

  /*
   * 사거리 또는 넓은 공간:
   * 클릭 지점에서 가장 가까운 중앙 후보 선택
   */
  const candidates = [
    { row: centerRow, col: centerCol },
    { row: centerRow, col: col },
    { row: row, col: centerCol },
    { row: row, col: col }
  ].filter((point) => isWalkable(point.row, point.col));

  candidates.sort((a, b) => {
    const distanceA =
      Math.abs(a.row - row) +
      Math.abs(a.col - col);

    const distanceB =
      Math.abs(b.row - row) +
      Math.abs(b.col - col);

    return distanceA - distanceB;
  });

  return candidates[0] || { row, col };
}

function centeredEntranceCandidates(candidates){
  if(!candidates?.length) return [];

  /*
   * 하나의 열린 면은 출입 가능 지점 1개로 계산합니다.
   * 예: 위/왼쪽/아래가 열려 있으면 3개, 4면이 열려 있으면 최대 4개.
   * 같은 면이 여러 셀로 이어져 있어도 면의 기하학적 중앙을 종점으로 사용합니다.
   */
  const groups=new Map();

  for(const e of candidates){
    const fixed=(e.side==='top'||e.side==='bottom')
      ? e.boothRow
      : e.boothCol;
    const key=`${e.side}:${fixed}`;

    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(e);
  }

  const out=[];

  for(const group of groups.values()){
    const horizontal=
      group[0].side==='top'||
      group[0].side==='bottom';

    group.sort((a,b)=>
      horizontal
        ? a.boothCol-b.boothCol
        : a.boothRow-b.boothRow
    );

    let run=[];

    const flush=()=>{
      if(!run.length) return;

      const first=run[0];
      const last=run[run.length-1];
      const middleIndex=Math.floor((run.length-1)/2);
      const base={...run[middleIndex]};

      if(horizontal){
        base.entranceX=
          ((first.boothCol-1)+last.boothCol)*cellPx/2;
        base.entranceY=
          (base.side==='top'
            ? base.boothRow-1
            : base.boothRow)*cellPx;
      }else{
        base.entranceX=
          (base.side==='left'
            ? base.boothCol-1
            : base.boothCol)*cellPx;
        base.entranceY=
          ((first.boothRow-1)+last.boothRow)*cellPx/2;
      }

      out.push(base);
      run=[];
    };

    for(const e of group){
      if(!run.length){
        run=[e];
        continue;
      }

      const prev=run[run.length-1];
      const contiguous=horizontal
        ? e.boothCol===prev.boothCol+1
        : e.boothRow===prev.boothRow+1;

      if(contiguous){
        run.push(e);
      }else{
        flush();
        run=[e];
      }
    }

    flush();
  }

  return out;
}

function shortestRouteToEntrances(start, candidates) {
  candidates = centeredEntranceCandidates(candidates);

  if (!start || !candidates?.length) return null;

  /*
   * 사용자가 벡터 경로 편집기에서 저장한 경로가 있으면
   * 기존 셀 골격을 다시 계산하지 않고 그 벡터 그래프 자체로 길찾기한다.
   */
  if (jointVectorRouteGraph?.vertices?.length && jointVectorRouteGraph?.segments?.length) {
    const vectorGraph = normalizeJointVectorGraph(jointVectorRouteGraph);
    const vertices = new Map(vectorGraph.vertices.map((vertex) => [vertex.id, vertex]));
    const adjacency = new Map(vectorGraph.vertices.map((vertex) => [vertex.id, []]));

    function directionKey(a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.hypot(dx, dy) < 0.001) return null;
      // 같은 직선 방향은 동일하게 인식하되, 반대 방향은 별도 방향으로 본다.
      const angle = Math.atan2(dy, dx);
      return String(Math.round(angle * 10000) / 10000);
    }

    for (const segment of vectorGraph.segments) {
      if (segment.closed === true) continue;
      const a = vertices.get(segment.source);
      const b = vertices.get(segment.target);
      if (!a || !b) continue;
      const cost = Math.hypot(b.x - a.x, b.y - a.y);
      adjacency.get(a.id).push({ to: b.id, cost, direction: directionKey(a, b) });
      adjacency.get(b.id).push({ to: a.id, cost, direction: directionKey(b, a) });
    }

    function nearestVectorProjection(point) {
      let best = null;
      for (const segment of vectorGraph.segments) {
        if (segment.closed === true) continue;
        const a = vertices.get(segment.source);
        const b = vertices.get(segment.target);
        if (!a || !b) continue;
        const projected = projectPointToSegment(point, a, b);
        if (!best || projected.distance < best.distance) {
          best = {
            point: { x: projected.x, y: projected.y },
            distance: projected.distance,
            source: a.id,
            target: b.id,
            sourceCost: Math.hypot(projected.x - a.x, projected.y - a.y),
            targetCost: Math.hypot(projected.x - b.x, projected.y - b.y),
            segmentId: segment.id
          };
        }
      }
      return best;
    }

    const startPoint = gridPoint(start.row, start.col);
    const startProjection = nearestVectorProjection(startPoint);
    if (!startProjection) return null;

    const stateBest = new Map();
    const previousState = new Map();
    const statesByVertex = new Map();
    const heap = [];

    function stateKey(id, incomingDirection) {
      return `${id}|${incomingDirection ?? 'START'}`;
    }

    function isBetter(first, second) {
      if (!second) return true;
      if (first.distance < second.distance - 0.0001) return true;
      return Math.abs(first.distance - second.distance) <= 0.0001 && first.turns < second.turns;
    }

    function heapLess(a, b) {
      if (Math.abs(a.distance - b.distance) > 0.0001) return a.distance < b.distance;
      return a.turns < b.turns;
    }

    function push(item) {
      heap.push(item);
      let index = heap.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (!heapLess(item, heap[parent])) break;
        heap[index] = heap[parent];
        index = parent;
      }
      heap[index] = item;
    }

    function pop() {
      if (!heap.length) return null;
      const root = heap[0];
      const last = heap.pop();
      if (heap.length) {
        let index = 0;
        while (true) {
          const left = index * 2 + 1;
          const right = left + 1;
          if (left >= heap.length) break;
          let child = left;
          if (right < heap.length && heapLess(heap[right], heap[left])) child = right;
          if (!heapLess(heap[child], last)) break;
          heap[index] = heap[child];
          index = child;
        }
        heap[index] = last;
      }
      return root;
    }

    function registerState(id, incomingDirection, distance, turns, previous = null) {
      const key = stateKey(id, incomingDirection);
      const candidate = { key, id, incomingDirection, distance, turns };
      if (!isBetter(candidate, stateBest.get(key))) return;
      stateBest.set(key, candidate);
      previousState.set(key, previous);
      if (!statesByVertex.has(id)) statesByVertex.set(id, new Set());
      statesByVertex.get(id).add(key);
      push(candidate);
    }

    const startProjectionDirection = directionKey(startPoint, startProjection.point);
    for (const [id, cost] of [
      [startProjection.source, startProjection.sourceCost],
      [startProjection.target, startProjection.targetCost]
    ]) {
      const vertex = vertices.get(id);
      if (!vertex) continue;
      const graphDirection = directionKey(startProjection.point, vertex);
      const initialTurns = startProjectionDirection && graphDirection && startProjectionDirection !== graphDirection ? 1 : 0;
      registerState(id, graphDirection, cost, initialTurns, null);
    }

    while (heap.length) {
      const current = pop();
      const stored = stateBest.get(current.key);
      if (!stored || stored.distance !== current.distance || stored.turns !== current.turns) continue;

      for (const edge of adjacency.get(current.id) || []) {
        const turnAdded = current.incomingDirection && edge.direction && current.incomingDirection !== edge.direction ? 1 : 0;
        registerState(
          edge.to,
          edge.direction,
          current.distance + edge.cost,
          current.turns + turnAdded,
          current.key
        );
      }
    }

    function vertexPathFromState(key) {
      const path = [];
      let currentKey = key;
      while (currentKey) {
        const state = stateBest.get(currentKey);
        if (!state) break;
        path.push(state.id);
        currentKey = previousState.get(currentKey) || null;
      }
      path.reverse();
      return path;
    }

    function compactAndScore(points) {
      const compacted = [];
      for (const point of points) {
        const last = compacted[compacted.length - 1];
        if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.01) compacted.push(point);
      }

      let exactDistance = 0;
      let turns = 0;
      let previousDirection = null;
      for (let index = 1; index < compacted.length; index++) {
        const a = compacted[index - 1];
        const b = compacted[index];
        exactDistance += Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, cellPx);
        const direction = directionKey(a, b);
        if (previousDirection && direction && direction !== previousDirection) turns++;
        if (direction) previousDirection = direction;
      }
      return { points: compacted, exactDistance, turns };
    }

    let best = null;
    for (const candidate of candidates) {
      const approachPoint = gridPoint(candidate.row, candidate.col);
      const targetProjection = nearestVectorProjection(approachPoint);
      if (!targetProjection) continue;
      const boundary = entranceBoundaryPoint(candidate);
      const routeVariants = [];

      for (const endpointId of [targetProjection.source, targetProjection.target]) {
        const endpoint = vertices.get(endpointId);
        if (!endpoint) continue;
        for (const terminalKey of statesByVertex.get(endpointId) || []) {
          const terminal = stateBest.get(terminalKey);
          if (!terminal) continue;
          const routePoints = [startPoint];
          if (Math.hypot(startPoint.x - startProjection.point.x, startPoint.y - startProjection.point.y) > 0.01) {
            routePoints.push(startProjection.point);
          }
          for (const id of vertexPathFromState(terminalKey)) {
            const vertex = vertices.get(id);
            if (vertex) routePoints.push({ x: vertex.x, y: vertex.y });
          }
          routePoints.push(targetProjection.point);
          if (Math.hypot(approachPoint.x - targetProjection.point.x, approachPoint.y - targetProjection.point.y) > 0.01) {
            routePoints.push(approachPoint);
          }
          routePoints.push(boundary);
          routeVariants.push(compactAndScore(routePoints));
        }
      }

      if (startProjection.segmentId === targetProjection.segmentId) {
        const directPoints = [startPoint];
        if (Math.hypot(startPoint.x - startProjection.point.x, startPoint.y - startProjection.point.y) > 0.01) {
          directPoints.push(startProjection.point);
        }
        directPoints.push(targetProjection.point);
        if (Math.hypot(approachPoint.x - targetProjection.point.x, approachPoint.y - targetProjection.point.y) > 0.01) {
          directPoints.push(approachPoint);
        }
        directPoints.push(boundary);
        routeVariants.push(compactAndScore(directPoints));
      }

      let chosen = null;
      for (const variant of routeVariants) {
        if (
          !chosen ||
          variant.exactDistance < chosen.exactDistance - 0.05 ||
          (Math.abs(variant.exactDistance - chosen.exactDistance) <= 0.05 && variant.turns < chosen.turns)
        ) chosen = variant;
      }
      if (!chosen) continue;

      const evaluated = {
        cells: [],
        entrance: candidate,
        routePoints: chosen.points,
        exactDistance: chosen.exactDistance,
        distance: Math.round(chosen.exactDistance),
        turns: chosen.turns
      };

      if (
        !best ||
        evaluated.exactDistance < best.exactDistance - 0.05 ||
        (Math.abs(evaluated.exactDistance - best.exactDistance) <= 0.05 && evaluated.turns < best.turns)
      ) best = evaluated;
    }

    return best;
  }

  clearanceMap ||= buildClearanceMap();
  centerlineSkeleton ||= rebuildEditableCenterlineSkeleton();

  const skeleton = centerlineSkeleton;
  if (!skeleton?.cells?.length) return null;

  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ];

  function key(row, col) {
    return `${row},${col}`;
  }

  function compactCells(cells) {
    const output = [];

    for (const cell of cells) {
      const last = output[output.length - 1];
      if (!last || last.row !== cell.row || last.col !== cell.col) {
        output.push({ row: cell.row, col: cell.col });
      }

      while (output.length >= 3) {
        const a = output[output.length - 3];
        const b = output[output.length - 2];
        const c = output[output.length - 1];

        const sameRow = a.row === b.row && b.row === c.row;
        const sameCol = a.col === b.col && b.col === c.col;

        if (sameRow || sameCol) {
          output.splice(output.length - 2, 1);
        } else {
          break;
        }
      }
    }

    return output;
  }

  function nearestSkeletonPath(source, preferredAxis = null) {
    /*
     * 목적지 접근점은 먼저 출입면과 같은 축의 중앙선을 찾는다.
     * 없을 때만 일반 BFS로 가장 가까운 중앙선에 연결한다.
     */
    if (preferredAxis === 'vertical') {
      const aligned = skeleton.cells
        .filter(
          (cell) =>
            !isCenterlineNodeMerged(cell) &&
            cell.col === source.col
        )
        .sort((a, b) => Math.abs(a.row - source.row) - Math.abs(b.row - source.row));

      for (const cell of aligned) {
        const step = Math.sign(cell.row - source.row);
        let safe = true;
        for (let row = source.row; row !== cell.row + step; row += step || 1) {
          if (!isWalkable(row, source.col)) {
            safe = false;
            break;
          }
          if (step === 0) break;
        }
        if (safe) {
          const path = [];
          for (
            let row = source.row;
            row !== cell.row;
            row += step
          ) {
            path.push({ row, col: source.col });
          }
          path.push({ row: cell.row, col: cell.col });
          return { cell, path };
        }
      }
    }

    if (preferredAxis === 'horizontal') {
      const aligned = skeleton.cells
        .filter(
          (cell) =>
            !isCenterlineNodeMerged(cell) &&
            cell.row === source.row
        )
        .sort((a, b) => Math.abs(a.col - source.col) - Math.abs(b.col - source.col));

      for (const cell of aligned) {
        const step = Math.sign(cell.col - source.col);
        let safe = true;
        for (let col = source.col; col !== cell.col + step; col += step || 1) {
          if (!isWalkable(source.row, col)) {
            safe = false;
            break;
          }
          if (step === 0) break;
        }
        if (safe) {
          const path = [];
          for (
            let col = source.col;
            col !== cell.col;
            col += step
          ) {
            path.push({ row: source.row, col });
          }
          path.push({ row: cell.row, col: cell.col });
          return { cell, path };
        }
      }
    }

    const queue = [{ row: source.row, col: source.col }];
    const previous = new Map();
    const visited = new Set([key(source.row, source.col)]);
    let found = null;

    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      const skeletonCell = skeleton.cellByKey.get(key(current.row, current.col));

      if (
        skeletonCell &&
        !isCenterlineNodeMerged(skeletonCell)
      ) {
        found = skeletonCell;
        break;
      }

      for (const [dr, dc] of dirs) {
        const next = {
          row: current.row + dr,
          col: current.col + dc
        };

        const nextKey = key(next.row, next.col);

        if (
          visited.has(nextKey) ||
          !isWalkable(next.row, next.col)
        ) {
          continue;
        }

        visited.add(nextKey);
        previous.set(nextKey, current);
        queue.push(next);
      }
    }

    if (!found) return null;

    const path = [];
    let current = { row: found.row, col: found.col };

    while (current) {
      path.push(current);
      current = previous.get(key(current.row, current.col)) || null;
    }

    path.reverse();
    return { cell: found, path };
  }

  function graphRoute(startCell, targetCell, initialDirection = 8, targetExitDirection = 8) {
    const count = skeleton.cells.length;
    const NONE_DIRECTION = 8;
    const dirCount = 9; // 실제 8방향(0~7) + 방향 없음(8)
    const stateCount = count * dirCount;
    // 화면에 같은 미터로 표시되는 경로는 사실상 동일 거리로 보고
    // 그중 실제 회전 횟수가 적은 경로를 우선한다.
    const DISTANCE_TIE_TOLERANCE = 0.75;

    const distance = new Float64Array(stateCount);
    const turns = new Int32Array(stateCount);
    const previous = new Int32Array(stateCount);
    const previousLink = new Int32Array(stateCount);

    distance.fill(Infinity);
    turns.fill(2147483647);
    previous.fill(-1);
    previousLink.fill(-1);

    /*
     * 경로 탐색의 방향과 거리는 원래 격자 좌표가 아니라 관리자 화면에서
     * 실제로 이동된 후보 경로 좌표를 기준으로 계산한다. 이전 구현은 점을
     * 드래그해 선을 곧게 펴도 row/col 기준으로 턴을 계산해, 화면상 턴이
     * 적은 경로가 선택되지 않는 문제가 있었다.
     */
    function visualPoint(cell) {
      return centerlinePoint(cell);
    }

    function directionFromPoints(a, b) {
      const dy = Math.sign(b.y - a.y);
      const dx = Math.sign(b.x - a.x);

      if (dy === -1 && dx === -1) return 0;
      if (dy === -1 && dx === 0) return 1;
      if (dy === -1 && dx === 1) return 2;
      if (dy === 0 && dx === -1) return 3;
      if (dy === 0 && dx === 1) return 4;
      if (dy === 1 && dx === -1) return 5;
      if (dy === 1 && dx === 0) return 6;
      if (dy === 1 && dx === 1) return 7;
      return NONE_DIRECTION;
    }

    function linkVisualGeometry(fromCell, toCell, link) {
      const points = [visualPoint(fromCell)];

      if (link.viaPoint) {
        points.push({ x: link.viaPoint.x, y: link.viaPoint.y });
      } else if (link.via) {
        points.push(gridPoint(link.via.row, link.via.col));
      }

      points.push(visualPoint(toCell));

      const directions = [];
      let cost = 0;

      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1];
        const b = points[index];
        const stepDirection = directionFromPoints(a, b);
        if (stepDirection !== NONE_DIRECTION) directions.push(stepDirection);
        cost += (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / cellPx;
      }

      return { points, directions, cost };
    }

    function stateKey(cellId, dir) {
      return cellId * dirCount + dir;
    }

    const heap = [];

    function compare(a, b) {
      const distanceGap = a.distance - b.distance;
      if (Math.abs(distanceGap) > DISTANCE_TIE_TOLERANCE) {
        return distanceGap;
      }
      if (a.turns !== b.turns) return a.turns - b.turns;
      return distanceGap;
    }

    function push(item) {
      heap.push(item);
      let index = heap.length - 1;

      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (compare(heap[parent], item) <= 0) break;
        heap[index] = heap[parent];
        index = parent;
      }

      heap[index] = item;
    }

    function pop() {
      if (!heap.length) return null;

      const root = heap[0];
      const last = heap.pop();

      if (heap.length) {
        let index = 0;

        while (true) {
          const left = index * 2 + 1;
          const right = left + 1;
          if (left >= heap.length) break;

          let child = left;

          if (
            right < heap.length &&
            compare(heap[right], heap[left]) < 0
          ) {
            child = right;
          }

          if (compare(heap[child], last) >= 0) break;
          heap[index] = heap[child];
          index = child;
        }

        heap[index] = last;
      }

      return root;
    }

    const normalizedInitialDirection =
      initialDirection >= 0 && initialDirection < NONE_DIRECTION
        ? initialDirection
        : NONE_DIRECTION;

    const startState = stateKey(startCell.id, normalizedInitialDirection);
    distance[startState] = 0;
    turns[startState] = 0;

    push({
      state: startState,
      cellId: startCell.id,
      dir: normalizedInitialDirection,
      distance: 0,
      turns: 0
    });

    let foundState = -1;
    let foundDistance = Infinity;
    let foundTurns = 2147483647;

    while (heap.length) {
      const current = pop();

      if (
        Math.abs(current.distance - distance[current.state]) > 1e-9 ||
        current.turns !== turns[current.state]
      ) {
        continue;
      }

      if (current.distance > foundDistance + DISTANCE_TIE_TOLERANCE) {
        break;
      }

      if (current.cellId === targetCell.id) {
        const terminalTurn =
          targetExitDirection !== NONE_DIRECTION &&
          current.dir !== NONE_DIRECTION &&
          current.dir !== targetExitDirection
            ? 1
            : 0;

        const totalTurns = current.turns + terminalTurn;

        if (
          current.distance < foundDistance - DISTANCE_TIE_TOLERANCE ||
          (
            Math.abs(current.distance - foundDistance) <= DISTANCE_TIE_TOLERANCE &&
            totalTurns < foundTurns
          )
        ) {
          foundState = current.state;
          foundDistance = current.distance;
          foundTurns = totalTurns;
        }

        continue;
      }

      const cell = skeleton.cells[current.cellId];

      for (let linkIndex = 0; linkIndex < cell.links.length; linkIndex++) {
        const link = cell.links[linkIndex];
        const next = skeleton.cells[link.to];
        if (!next) continue;
        const candidateEdgeKey = routeEdgeKey(cell, next);
        if (routeClosedEdges.has(candidateEdgeKey) || routeDeletedEdges.has(candidateEdgeKey)) continue;

        /*
         * 링크가 대각 보정점(via/viaPoint)을 포함하면 화면에는 실제로
         * 두 개의 직교 구간과 한 번의 꺾임으로 표시된다. 기존에는 이를
         * 하나의 대각 방향으로 계산해 턴 수가 실제 표시와 달랐다.
         * 링크 내부의 방향 변화까지 포함하여 같은 거리에서는 실제 턴이
         * 가장 적은 경로가 선택되도록 한다.
         */
        const visualGeometry = linkVisualGeometry(cell, next, link);
        const directionSteps = visualGeometry.directions;

        let nextTurns = current.turns;
        let activeDir = current.dir;

        for (const stepDir of directionSteps) {
          if (activeDir !== NONE_DIRECTION && activeDir !== stepDir) nextTurns++;
          activeDir = stepDir;
        }

        const nextDir = activeDir;
        const nextDistance = current.distance + visualGeometry.cost;
        const nextState = stateKey(next.id, nextDir);

        if (
          nextDistance < distance[nextState] - DISTANCE_TIE_TOLERANCE ||
          (
            Math.abs(nextDistance - distance[nextState]) <= DISTANCE_TIE_TOLERANCE &&
            nextTurns < turns[nextState]
          )
        ) {
          distance[nextState] = nextDistance;
          turns[nextState] = nextTurns;
          previous[nextState] = current.state;
          previousLink[nextState] = linkIndex;

          push({
            state: nextState,
            cellId: next.id,
            dir: nextDir,
            distance: nextDistance,
            turns: nextTurns
          });
        }
      }
    }

    if (foundState === -1) return null;

    const reversed = [];
    let state = foundState;

    while (state !== -1) {
      const cellId = Math.floor(state / dirCount);
      const cell = skeleton.cells[cellId];
      const prevState = previous[state];

      reversed.push({ row: cell.row, col: cell.col });

      if (prevState !== -1) {
        const prevCellId = Math.floor(prevState / dirCount);
        const prevCell = skeleton.cells[prevCellId];
        const link = prevCell.links.find((item) => item.to === cellId);

        if (link?.viaPoint) {
          reversed.push({
            row: link.viaPoint.y / cellPx + 0.5,
            col: link.viaPoint.x / cellPx + 0.5
          });
        } else if (link?.via) {
          reversed.push({
            row: link.via.row,
            col: link.via.col
          });
        }
      }

      state = prevState;
    }

    reversed.reverse();

    return {
      cells: compactCells(reversed),
      distance: distance[foundState],
      turns: foundTurns
    };
  }

  function routeMetrics(cells) {
    let distance = 0;
    let turns = 0;
    let previousDirection = null;

    for (let i = 1; i < cells.length; i++) {
      const dr = Math.sign(cells[i].row - cells[i - 1].row);
      const dc = Math.sign(cells[i].col - cells[i - 1].col);
      const direction = `${dr},${dc}`;

      distance +=
        Math.abs(cells[i].row - cells[i - 1].row) +
        Math.abs(cells[i].col - cells[i - 1].col);

      if (
        previousDirection &&
        previousDirection !== direction
      ) {
        turns++;
      }

      previousDirection = direction;
    }

    return { distance, turns };
  }

  function pathDirection(from, to) {
    if (!from || !to) return 8;
    const dr = Math.sign(to.row - from.row);
    const dc = Math.sign(to.col - from.col);

    if (dr === -1 && dc === -1) return 0;
    if (dr === -1 && dc === 0) return 1;
    if (dr === -1 && dc === 1) return 2;
    if (dr === 0 && dc === -1) return 3;
    if (dr === 0 && dc === 1) return 4;
    if (dr === 1 && dc === -1) return 5;
    if (dr === 1 && dc === 0) return 6;
    if (dr === 1 && dc === 1) return 7;
    return 8;
  }

  const startConnector = nearestSkeletonPath(start);
  if (!startConnector) return null;

  let best = null;

  for (const candidate of candidates) {
    const axis =
      candidate.side === 'top' || candidate.side === 'bottom'
        ? 'vertical'
        : 'horizontal';

    const approachSource = {
      row: candidate.row,
      col: candidate.col
    };

    const targetConnector = nearestSkeletonPath(
      approachSource,
      axis
    );

    if (!targetConnector) continue;

    function routeCellVisualPoint(cell) {
      const skeletonCell = centerlineSkeleton?.cellByKey?.get(
        `${cell.row},${cell.col}`
      );
      return skeletonCell ? centerlinePoint(skeletonCell) : gridPoint(cell.row, cell.col);
    }

    function visualPathDirection(from, to) {
      const a = routeCellVisualPoint(from);
      const b = routeCellVisualPoint(to);
      const dy = Math.sign(b.y - a.y);
      const dx = Math.sign(b.x - a.x);
      if (dy === -1 && dx === -1) return 0;
      if (dy === -1 && dx === 0) return 1;
      if (dy === -1 && dx === 1) return 2;
      if (dy === 0 && dx === -1) return 3;
      if (dy === 0 && dx === 1) return 4;
      if (dy === 1 && dx === -1) return 5;
      if (dy === 1 && dx === 0) return 6;
      if (dy === 1 && dx === 1) return 7;
      return 8;
    }

    const startInitialDirection =
      startConnector.path.length >= 2
        ? visualPathDirection(
            startConnector.path[startConnector.path.length - 2],
            startConnector.path[startConnector.path.length - 1]
          )
        : 8;

    const reversedTarget = [...targetConnector.path].reverse();
    const targetExitDirection =
      reversedTarget.length >= 2
        ? visualPathDirection(reversedTarget[0], reversedTarget[1])
        : 8;

    const middle = graphRoute(
      startConnector.cell,
      targetConnector.cell,
      startInitialDirection,
      targetExitDirection
    );

    if (!middle) continue;

    const combined = [];

    combined.push(...startConnector.path);
    combined.push(...middle.cells);

    combined.push(...reversedTarget);

    const compacted = compactCells(combined);
    const end = entranceBoundaryPoint(candidate);
    const routePoints = compacted.map((cell) => {
      const skeletonCell =
        centerlineSkeleton?.cellByKey?.get(
          `${cell.row},${cell.col}`
        );

      return skeletonCell
        ? centerlinePoint(skeletonCell)
        : gridPoint(cell.row, cell.col);
    });

    routePoints.push(end);

    const metrics = routeMetrics(compacted);
    const finalDistance =
      metrics.distance +
      (
        Math.abs(
          routePoints[routePoints.length - 2].x - end.x
        ) +
        Math.abs(
          routePoints[routePoints.length - 2].y - end.y
        )
      ) / cellPx;

    let fullTurns = 0;
    let previousPointDirection = null;

    for (let index = 1; index < routePoints.length; index++) {
      const dx = Math.sign(routePoints[index].x - routePoints[index - 1].x);
      const dy = Math.sign(routePoints[index].y - routePoints[index - 1].y);
      if (dx === 0 && dy === 0) continue;
      const pointDirection = `${dx},${dy}`;

      if (
        previousPointDirection !== null &&
        previousPointDirection !== pointDirection
      ) {
        fullTurns++;
      }

      previousPointDirection = pointDirection;
    }

    const evaluated = {
      cells: compacted,
      entrance: candidate,
      routePoints,
      exactDistance: finalDistance,
      distance: Math.round(finalDistance),
      turns: fullTurns
    };

    if (
      !best ||
      evaluated.exactDistance < best.exactDistance - 0.75 ||
      (
        Math.abs(evaluated.exactDistance - best.exactDistance) <= 0.75 &&
        evaluated.turns < best.turns
      )
    ) {
      best = evaluated;
    }
  }

  return best;
}

function simplifyPath(cells){
  if(cells.length<=2)return cells;
  const out=[cells[0]];let pr=cells[1].row-cells[0].row,pc=cells[1].col-cells[0].col;
  for(let i=2;i<cells.length;i++){
    const dr=cells[i].row-cells[i-1].row,dc=cells[i].col-cells[i-1].col;
    if(dr!==pr||dc!==pc)out.push(cells[i-1]);pr=dr;pc=dc;
  }
  out.push(cells[cells.length-1]);return out;
}

function entranceBoundaryPoint(e) {
  if(Number.isFinite(e.entranceX)&&Number.isFinite(e.entranceY)) return {x:e.entranceX,y:e.entranceY};
  if (e.side === "top") return { x: (e.boothCol - 0.5) * cellPx, y: (e.boothRow - 1) * cellPx };
  if (e.side === "bottom") return { x: (e.boothCol - 0.5) * cellPx, y: e.boothRow * cellPx };
  if (e.side === "left") return { x: (e.boothCol - 1) * cellPx, y: (e.boothRow - 0.5) * cellPx };
  return { x: e.boothCol * cellPx, y: (e.boothRow - 0.5) * cellPx };
}

function buildSafeOrthogonalPath(cells){
  return simplifyPath(cells).map(c=>gridPoint(c.row,c.col));
}

function fitViewToPoints(points, paddingCells = 5) {
  if (!points.length) return;
  const pad = paddingCells * cellPx;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let x = Math.max(0, Math.min(...xs) - pad);
  let y = Math.max(0, Math.min(...ys) - pad);
  let width = Math.min(fullViewBox.width - x, Math.max(cellPx * 12, Math.max(...xs) - Math.min(...xs) + pad * 2));
  let height = Math.min(fullViewBox.height - y, Math.max(cellPx * 12, Math.max(...ys) - Math.min(...ys) + pad * 2));

  const mapRatio = floorMap.clientWidth && floorMap.clientHeight ? floorMap.clientWidth / floorMap.clientHeight : fullViewBox.width / fullViewBox.height;
  if (width / height > mapRatio) height = width / mapRatio;
  else width = height * mapRatio;
  width = Math.min(width, fullViewBox.width);
  height = Math.min(height, fullViewBox.height);
  x = Math.max(0, Math.min(fullViewBox.width - width, (Math.min(...xs) + Math.max(...xs) - width) / 2));
  y = Math.max(0, Math.min(fullViewBox.height - height, (Math.min(...ys) + Math.max(...ys) - height) / 2));
  currentViewBox = { x, y, width, height };
  applyViewBox();
}

function renderAnimatedRouteFlow(routePoints) {
  floorMap.querySelector("#routeFlowLayer")?.remove();
  if (!Array.isArray(routePoints) || routePoints.length < 2) return;

  const pathData = routePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  layer.setAttribute("id", "routeFlowLayer");
  layer.setAttribute("class", "route-flow-layer");
  layer.setAttribute("pointer-events", "none");

  const colors = ["#ffffff", "#7dd3fc", "#3b82f6", "#6366f1"];
  const duration = 3.2;
  colors.forEach((color, index) => {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", String(Math.max(2.8, cellPx * 0.23 + index * 0.18)));
    dot.setAttribute("fill", color);
    dot.setAttribute("class", "route-flow-dot");
    dot.setAttribute("filter", "url(#routeFlowGlow)");

    const motion = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
    motion.setAttribute("path", pathData);
    motion.setAttribute("dur", `${duration}s`);
    motion.setAttribute("begin", `${-(index * 0.16)}s`);
    motion.setAttribute("repeatCount", "indefinite");
    motion.setAttribute("calcMode", "linear");
    dot.appendChild(motion);
    layer.appendChild(dot);
  });

  let defs = floorMap.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    floorMap.insertBefore(defs, floorMap.firstChild);
  }
  if (!defs.querySelector("#routeFlowGlow")) {
    const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", "routeFlowGlow");
    filter.setAttribute("x", "-120%");
    filter.setAttribute("y", "-120%");
    filter.setAttribute("width", "340%");
    filter.setAttribute("height", "340%");
    const shadow = document.createElementNS("http://www.w3.org/2000/svg", "feDropShadow");
    shadow.setAttribute("dx", "0");
    shadow.setAttribute("dy", "0");
    shadow.setAttribute("stdDeviation", "1.8");
    shadow.setAttribute("flood-color", "#60a5fa");
    shadow.setAttribute("flood-opacity", ".95");
    filter.appendChild(shadow);
    defs.appendChild(filter);
  }

  routeLine.insertAdjacentElement("afterend", layer);
}

function showRoute() {
  if (!selectedDestination) return;

  // 지점 편집 중 적용된 강제 숨김이 남아 있더라도 길찾기 실행 시 복구한다.
  floorMap.classList.remove("location-edit-mode");
  startMarker?.style.removeProperty("display");
  destinationMarker?.style.removeProperty("display");
  routeLine?.style.removeProperty("display");
  startMarker?.style.removeProperty("visibility");
  destinationMarker?.style.removeProperty("visibility");
  routeLine?.style.removeProperty("visibility");

  if (!gridMap) {
    routeInfo.textContent =
      "엑셀 배치도를 등록하면 실제 복도 기반 경로를 계산합니다.";
    return;
  }

  const found = shortestRouteToEntrances(
    currentStartCell(),
    selectedDestination.entranceCandidates
  );

  if (!found) {
    routeInfo.textContent =
      "현재 위치에서 연결된 출입구를 찾지 못했습니다.";
    return;
  }

  const routePoints=found.routePoints||[];
  const end=entranceBoundaryPoint(found.entrance);

  routeLine.setAttribute(
    "points",
    routePoints
      .map((point)=>`${point.x},${point.y}`)
      .join(" ")
  );

  routeLine.setAttribute(
    "stroke-width",
    Math.max(3,cellPx*0.58)
  );
  routeLine.setAttribute(
    "stroke-dasharray",
    `${Math.max(1.8, cellPx * 0.20)} ${Math.max(4.8, cellPx * 0.58)}`
  );
  routeLine.setAttribute("stroke-dashoffset", "0");
  renderAnimatedRouteFlow(routePoints);

  destinationMarker.setAttribute("cx",end.x);
  destinationMarker.setAttribute("cy",end.y);
  destinationMarker.setAttribute(
    "r",
    Math.max(3,cellPx*0.45)
  );
  destinationMarker.style.display="block";

  const sideName={
    top:"위쪽",
    bottom:"아래쪽",
    left:"왼쪽",
    right:"오른쪽"
  }[found.entrance.side];

  routeInfo.textContent=
    `${selectedDestination.id}까지 약 ${found.distance}m · `+
    `${found.turns}회 회전 · ${sideName} 출입면으로 안내`;

  requestAnimationFrame(()=>
    fitViewToPoints(routePoints)
  );
}

function applyViewBox() {
  if (mapViewport) return mapViewport.apply(currentViewBox);
  floorMap.setAttribute(
    "viewBox",
    `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`
  );
  return currentViewBox;
}

function fitMap() {
  if (mapViewport) return mapViewport.fit();
  currentViewBox = { ...fullViewBox };
  return applyViewBox();
}

function zoomMap(factor, centerX, centerY) {
  if (mapViewport) return mapViewport.zoom(factor, centerX, centerY);
  return currentViewBox;
}

function clientToSvg(clientX, clientY) {
  if (mapViewport) return mapViewport.clientToSvg(clientX, clientY);
  return { x: clientX, y: clientY };
}

function initializeMapViewport() {
  if (!window.MapViewportController) {
    throw new Error("지도 화면 제어 모듈을 불러오지 못했습니다.");
  }

  mapViewport = window.MapViewportController.create({
    svg: floorMap,
    getFullViewBox: () => ({ ...fullViewBox }),
    getViewBox: () => ({ ...currentViewBox }),
    setViewBox: (next) => {
      currentViewBox = { ...next };
    },
    hooks: {
      pointerDown(event) {
        if (handleSimpleRouteDrawClick(event)) return true;

        if (centerlineEditMode) {
          // 편집 모드에서는 중앙선 핸들이 아닌 영역의 지도 이동을 막는다.
          return !event.target?.hasAttribute?.("data-centerline-handle");
        }

        if (adminLocationPickMode && gridMap) {
          const point = clientToSvg(event.clientX, event.clientY);
          const col = Math.floor(point.x / cellPx) + 1;
          const row = Math.floor(point.y / cellPx) + 1;
          if (!isWalkable(row, col)) {
            const status = $("#adminLocationStatus");
            if (status) status.textContent = "흰색 복도 위치를 선택해 주세요.";
            return true;
          }
          saveAdminLocationAt(row, col, point);
          return true;
        }

        if (startPickMode && gridMap) {
          const point = clientToSvg(event.clientX, event.clientY);
          const col = Math.floor(point.x / cellPx) + 1;
          const row = Math.floor(point.y / cellPx) + 1;
          if (!isWalkable(row, col)) {
            if (locationStatus) locationStatus.textContent = "흰색 복도 셀을 선택해 주세요.";
            return true;
          }

          const snapped = snapToCorridorCenter(row, col);
          customStart = snapped;
          storage.setItem(config.STORAGE_KEYS.CUSTOM_START, JSON.stringify(customStart));
          startPickMode = false;
          floorMap.classList.remove("placement-mode");
          populateStarts();
          updateStartMarker();
          if (locationStatus) {
            locationStatus.textContent =
              `선택 지점을 복도 중앙(${snapped.col}열 ${snapped.row}행)으로 자동 보정했습니다.`;
          }
          return true;
        }

        return false;
      },
      pointerMove(event) {
        return moveManagedLocationDrag(event) ||
          moveBoothLabelDrag(event) ||
          movePendingRouteSegmentPointer(event) ||
          moveRouteSegmentDrag(event) ||
          moveCenterlineDrag(event);
      },
      pointerEnd(event) {
        return endManagedLocationDrag(event) ||
          endBoothLabelDrag(event) ||
          endPendingRouteSegmentPointer(event) ||
          endRouteSegmentDrag(event) ||
          endCenterlineDrag(event);
      }
    }
  });

  $("#zoomInBtn")?.addEventListener("click", () => zoomMap(0.75));
  $("#zoomOutBtn")?.addEventListener("click", () => zoomMap(1.33));
  $("#fitBtn")?.addEventListener("click", fitMap);
}

initializeMapViewport();

searchInput?.addEventListener("input", e => renderResults(e.target.value));
startSelect?.addEventListener("change", () => {
  sessionStorage.setItem(LAST_START_SELECTION_KEY, startSelect.value);
  updateStartMarker();
});
routeBtn?.addEventListener("click", showRoute);
pickStartBtn?.addEventListener("click",()=>{if(!gridMap){if(locationStatus)locationStatus.textContent="먼저 관리자 화면에서 배치 엑셀을 등록해 주세요.";return;}startPickMode=true;floorMap.classList.add("placement-mode");locationStatus.textContent="지도에서 흰색 복도 위치를 누르세요.";});
$("#pickAdminLocationBtn")?.addEventListener("click",()=>{const st=$("#adminLocationStatus");if(!gridMap){st.textContent="먼저 전시장 배치 엑셀을 등록해 주세요.";return;}const next=nextAutomaticQrLocation();const nameInput=$("#locationNameInput");const codeInput=$("#locationCodeInput");if(nameInput&&!nameInput.value.trim())nameInput.value=next.name;if(codeInput&&!codeInput.value.trim())codeInput.value=next.code;adminLocationPickMode=true;startPickMode=false;floorMap.classList.add("placement-mode");st.textContent="지도에서 위치를 클릭하세요. 새 위치코드는 자동 생성되고 가장 가까운 동선 위로 정렬됩니다.";});
document.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable;
  if (typing || !centerlineEditMode) return;

  if (event.key === "Escape" && routeDrawMode) {
    event.preventDefault();
    routeDrawStartCell = null;
    renderCenterlineDebug();
    refreshSimpleRouteStatus("현재 시작점 선택을 취소했습니다. 그리기 모드는 계속 유지됩니다.");
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    if (!selectedRouteSegment?.edgeKeys?.length) return;
    event.preventDefault();
    routeEditorTool = "delete";
    routeDrawMode = false;
    routeDrawStartCell = null;
    updateRouteEditorToolButtons();
    deleteSelectedRouteSegment();
  }
});
