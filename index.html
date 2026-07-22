/* FINDER modular section: routing. Load order is defined in admin.html and index.html. */
function buildSingleCenterlineSkeleton() {
  if (!gridMap) return null;

  const rows = gridMap.rows;
  const cols = gridMap.cols;

  /*
   * Zhang-Suen thinning:
   * 흰색 복도 영역을 위상은 유지하면서 한 셀 두께의 단일 골격선으로 축소한다.
   * 따라서 넓은 복도에도 중앙선 후보가 여러 줄 남지 않는다.
   */
  const image = Array.from(
    { length: rows + 2 },
    () => new Uint8Array(cols + 2)
  );

  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= cols; col++) {
      image[row][col] = isWalkable(row, col) ? 1 : 0;
    }
  }

  function neighbors(row, col) {
    return [
      image[row - 1][col],     // P2
      image[row - 1][col + 1], // P3
      image[row][col + 1],     // P4
      image[row + 1][col + 1], // P5
      image[row + 1][col],     // P6
      image[row + 1][col - 1], // P7
      image[row][col - 1],     // P8
      image[row - 1][col - 1]  // P9
    ];
  }

  function transitions(values) {
    let count = 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i] === 0 && values[(i + 1) % values.length] === 1) {
        count++;
      }
    }
    return count;
  }

  let changed = true;
  let iteration = 0;
  const iterationLimit = Math.max(rows, cols) * 4;

  while (changed && iteration < iterationLimit) {
    changed = false;
    iteration++;

    for (let phase = 0; phase < 2; phase++) {
      const remove = [];

      for (let row = 1; row <= rows; row++) {
        for (let col = 1; col <= cols; col++) {
          if (image[row][col] !== 1) continue;

          const p = neighbors(row, col);
          const count = p.reduce((sum, value) => sum + value, 0);

          if (count < 2 || count > 6) continue;
          if (transitions(p) !== 1) continue;

          if (phase === 0) {
            if (p[0] * p[2] * p[4] !== 0) continue;
            if (p[2] * p[4] * p[6] !== 0) continue;
          } else {
            if (p[0] * p[2] * p[6] !== 0) continue;
            if (p[0] * p[4] * p[6] !== 0) continue;
          }

          remove.push([row, col]);
        }
      }

      if (remove.length) {
        changed = true;
        for (const [row, col] of remove) {
          image[row][col] = 0;
        }
      }
    }
  }

  const cells = [];
  const cellByKey = new Map();

  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= cols; col++) {
      if (image[row][col] !== 1) continue;

      const cell = {
        id: cells.length,
        row,
        col,
        links: []
      };

      cells.push(cell);
      cellByKey.set(`${row},${col}`, cell);
    }
  }

  function addLink(a, b, cost, via = null) {
    if (!a || !b || a.id === b.id) return;

    if (!a.links.some((link) => link.to === b.id)) {
      a.links.push({ to: b.id, cost, via });
    }

    if (!b.links.some((link) => link.to === a.id)) {
      b.links.push({ to: a.id, cost, via });
    }
  }

  const orthogonal = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ];

  for (const cell of cells) {
    for (const [dr, dc] of orthogonal) {
      const other = cellByKey.get(`${cell.row + dr},${cell.col + dc}`);
      if (other) addLink(cell, other, 1);
    }
  }

  /*
   * thinning 결과에서 대각선으로만 맞닿은 셀은 직각 두 구간으로 연결한다.
   *
   * 기존 문제:
   * 교차점 주변의 여러 대각 셀을 모두 연결하면서 작은 사각형·고리 구조가
   * 반복 생성되었다.
   *
   * 개선:
   * 1. 두 대각 셀 사이에 이미 직교 중앙선 셀이 있으면 대각 연결을 만들지 않는다.
   * 2. 같은 2×2 블록에서는 대각 연결을 최대 1개만 허용한다.
   * 3. 순수하게 대각으로만 끊어진 경우에만 clearance가 큰 경유점을 사용한다.
   */
  const diagonals = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
  ];

  clearanceMap ||= buildClearanceMap();
  const diagonalBlockUsed = new Set();

  for (const cell of cells) {
    for (const [dr, dc] of diagonals) {
      const other = cellByKey.get(
        `${cell.row + dr},${cell.col + dc}`
      );

      if (!other || other.id <= cell.id) continue;

      const bridgeA = {
        row: cell.row,
        col: other.col
      };

      const bridgeB = {
        row: other.row,
        col: cell.col
      };

      /*
       * 어느 한쪽 bridge가 이미 중앙선 셀이라면
       * 직교 링크만으로 연결되므로 대각 링크는 불필요하다.
       */
      if (
        cellByKey.has(`${bridgeA.row},${bridgeA.col}`) ||
        cellByKey.has(`${bridgeB.row},${bridgeB.col}`)
      ) {
        continue;
      }

      const blockKey = [
        Math.min(cell.row, other.row),
        Math.min(cell.col, other.col)
      ].join(',');

      if (diagonalBlockUsed.has(blockKey)) continue;

      const options = [bridgeA, bridgeB].filter(
        (point) => isWalkable(point.row, point.col)
      );

      if (!options.length) continue;

      options.sort(
        (a, b) =>
          (clearanceMap[b.row]?.[b.col] || 0) -
          (clearanceMap[a.row]?.[a.col] || 0)
      );

      diagonalBlockUsed.add(blockKey);
      addLink(cell, other, 2, options[0]);
    }
  }

  return {
    cells,
    cellByKey,
    image,
    iterations: iteration
  };
}


function loadCenterlineOverrides() {
  try {
    centerlineOverrides = JSON.parse(
      storage.getItem(CENTERLINE_OVERRIDE_KEY) || "{}"
    );
  } catch {
    centerlineOverrides = {};
    storage.removeItem(CENTERLINE_OVERRIDE_KEY);
  }

  try {
    centerlineDeletedNodes = new Set(
      JSON.parse(
        storage.getItem(CENTERLINE_DELETED_KEY) || "[]"
      )
    );
  } catch {
    centerlineDeletedNodes = new Set();
    storage.removeItem(CENTERLINE_DELETED_KEY);
  }

  try {
    centerlineBypasses = JSON.parse(
      storage.getItem(CENTERLINE_BYPASS_KEY) || "{}"
    );
  } catch {
    centerlineBypasses = {};
    storage.removeItem(CENTERLINE_BYPASS_KEY);
  }

  try {
    centerlineMergedNodes = JSON.parse(
      storage.getItem(CENTERLINE_MERGE_KEY) || "{}"
    );
  } catch {
    centerlineMergedNodes = {};
    storage.removeItem(CENTERLINE_MERGE_KEY);
  }

  try {
    centerlineCustomNodes = JSON.parse(
      storage.getItem(CENTERLINE_CUSTOM_NODE_KEY) || "{}"
    );
  } catch {
    centerlineCustomNodes = {};
    storage.removeItem(CENTERLINE_CUSTOM_NODE_KEY);
  }

  try {
    routeClosedEdges = new Set(JSON.parse(storage.getItem(ROUTE_CLOSED_EDGE_KEY) || "[]"));
  } catch {
    routeClosedEdges = new Set();
    storage.removeItem(ROUTE_CLOSED_EDGE_KEY);
  }

  try {
    routeDeletedEdges = new Set(JSON.parse(storage.getItem(ROUTE_DELETED_EDGE_KEY) || "[]"));
  } catch {
    routeDeletedEdges = new Set();
    storage.removeItem(ROUTE_DELETED_EDGE_KEY);
  }

  try {
    routeManualSegments = JSON.parse(storage.getItem(ROUTE_MANUAL_SEGMENT_KEY) || "[]");
    if (!Array.isArray(routeManualSegments)) routeManualSegments = [];
  } catch {
    routeManualSegments = [];
    storage.removeItem(ROUTE_MANUAL_SEGMENT_KEY);
  }
}

function saveCenterlineOverrides() {
  storage.setItem(
    CENTERLINE_OVERRIDE_KEY,
    JSON.stringify(centerlineOverrides)
  );

  storage.setItem(
    CENTERLINE_DELETED_KEY,
    JSON.stringify([...centerlineDeletedNodes])
  );

  storage.setItem(
    CENTERLINE_BYPASS_KEY,
    JSON.stringify(centerlineBypasses)
  );

  storage.setItem(
    CENTERLINE_MERGE_KEY,
    JSON.stringify(centerlineMergedNodes)
  );

  storage.setItem(
    CENTERLINE_CUSTOM_NODE_KEY,
    JSON.stringify(centerlineCustomNodes)
  );

  storage.setItem(ROUTE_CLOSED_EDGE_KEY, JSON.stringify([...routeClosedEdges]));
  storage.setItem(ROUTE_DELETED_EDGE_KEY, JSON.stringify([...routeDeletedEdges]));
  storage.setItem(ROUTE_MANUAL_SEGMENT_KEY, JSON.stringify(routeManualSegments));
  broadcastLocalStateChange("route");
}


// 경로 병합 디버그 기록
const routeMergeDebugLog = [];
let routeMergeDebugSequence = 0;

function routeDebugPoint(cell) {
  if (!cell) return null;
  const point = centerlinePoint(cell);
  return {
    key: centerlineNodeKey(cell),
    id: cell.id,
    x: Number(point.x.toFixed(3)),
    y: Number(point.y.toFixed(3)),
    degree: Array.isArray(cell.links) ? cell.links.length : 0,
    links: (cell.links || []).map((link) => ({
      toId: link.to,
      toKey: centerlineSkeleton?.cells?.[link.to]
        ? centerlineNodeKey(centerlineSkeleton.cells[link.to])
        : null,
      cost: Number(Number(link.cost || 0).toFixed(4))
    }))
  };
}

function routeDebugIncidentGeometry(cell, skeleton = centerlineSkeleton) {
  if (!cell || !skeleton?.cells) {
    return { totalLength: 0, edges: [], bounds: null };
  }

  const origin = centerlinePoint(cell);
  const edges = [];
  let minX = origin.x;
  let maxX = origin.x;
  let minY = origin.y;
  let maxY = origin.y;
  let totalLength = 0;

  for (const link of cell.links || []) {
    const target = skeleton.cells[link.to];
    if (!target) continue;
    const point = centerlinePoint(target);
    const length = Math.hypot(point.x - origin.x, point.y - origin.y);
    totalLength += length;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    edges.push({
      toKey: centerlineNodeKey(target),
      toId: target.id,
      x: Number(point.x.toFixed(3)),
      y: Number(point.y.toFixed(3)),
      length: Number(length.toFixed(3))
    });
  }

  return {
    totalLength: Number(totalLength.toFixed(3)),
    edges,
    bounds: {
      minX: Number(minX.toFixed(3)),
      maxX: Number(maxX.toFixed(3)),
      minY: Number(minY.toFixed(3)),
      maxY: Number(maxY.toFixed(3)),
      width: Number((maxX - minX).toFixed(3)),
      height: Number((maxY - minY).toFixed(3))
    }
  };
}

function routeDebugCreateMergeRecord(sourceCell, targetCell) {
  return {
    id: ++routeMergeDebugSequence,
    at: new Date().toISOString(),
    sourceKey: centerlineNodeKey(sourceCell),
    targetKey: centerlineNodeKey(targetCell),
    before: {
      source: routeDebugPoint(sourceCell),
      target: routeDebugPoint(targetCell),
      sourceGeometry: routeDebugIncidentGeometry(sourceCell),
      targetGeometry: routeDebugIncidentGeometry(targetCell),
      mergeMap: { ...centerlineMergedNodes }
    },
    after: null,
    analysis: null
  };
}

function routeDebugFinishMergeRecord(record, sourceKey, targetKey) {
  const resolvedTargetKey = resolveMergedCenterlineKey(targetKey);
  const source = centerlineSkeleton?.cellByKey?.get(sourceKey) || null;
  const target = centerlineSkeleton?.cellByKey?.get(resolvedTargetKey) || null;

  record.after = {
    sourceExists: !!source && !isCenterlineNodeMerged(source),
    source: routeDebugPoint(source),
    target: routeDebugPoint(target),
    targetGeometry: routeDebugIncidentGeometry(target),
    mergeMap: { ...centerlineMergedNodes }
  };

  const beforeLength =
    (record.before.sourceGeometry?.totalLength || 0) +
    (record.before.targetGeometry?.totalLength || 0);
  const afterLength = record.after.targetGeometry?.totalLength || 0;
  const shrink = beforeLength - afterLength;
  const shrinkRatio = beforeLength > 0 ? shrink / beforeLength : 0;

  const reasons = [];
  if (!target) reasons.push('병합 후 대표 꼭지점을 찾지 못했습니다.');
  if (source) reasons.push('병합 후 원본 꼭지점이 그래프에 남아 있습니다.');
  if (afterLength + 0.5 < beforeLength) {
    reasons.push('병합 전 연결 길이 합계보다 병합 후 길이가 짧습니다.');
  }
  if ((record.before.source?.degree || 0) > 1 && (record.before.target?.degree || 0) > 1) {
    reasons.push('두 꼭지점 모두 여러 선에 연결되어 있어 단순 끝점 병합이 아닐 수 있습니다.');
  }
  if (record.sourceKey === resolvedTargetKey) {
    reasons.push('원본과 대상이 같은 대표 키로 해석되었습니다.');
  }

  record.analysis = {
    beforeIncidentLength: Number(beforeLength.toFixed(3)),
    afterIncidentLength: Number(afterLength.toFixed(3)),
    shrink: Number(shrink.toFixed(3)),
    shrinkRatio: Number(shrinkRatio.toFixed(4)),
    suspected: shrink > Math.max(1, cellPx * 0.2),
    reasons
  };

  routeMergeDebugLog.push(record);
  if (routeMergeDebugLog.length > 100) routeMergeDebugLog.shift();

  console.groupCollapsed(
    `[경로 병합 디버그 #${record.id}] ${record.sourceKey} -> ${resolvedTargetKey}`
  );
  console.log(record);
  console.groupEnd();

  if (record.analysis.suspected) {
    alert(
      '경로 병합 후 선 길이 감소가 감지되었습니다.\n\n' +
      `병합 기록: #${record.id}\n` +
      `병합 전 연결 길이: ${record.analysis.beforeIncidentLength}px\n` +
      `병합 후 연결 길이: ${record.analysis.afterIncidentLength}px\n` +
      `감소량: ${record.analysis.shrink}px\n\n` +
      '상단의 “병합 로그 저장” 버튼을 눌러 JSON 파일을 보내주세요.'
    );
  }
}

function safeFileTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function downloadRouteMergeDebugLog() {
  const payload = {
    format: 'exhibition-route-merge-debug',
    version: 2,
    exportedAt: new Date().toISOString(),
    page: location.href,
    userAgent: navigator.userAgent,
    grid: gridMap ? {
      sourceName: gridMap.sourceName || null,
      sheetName: gridMap.sheetName || null,
      rows: gridMap.rows,
      cols: gridMap.cols,
      cellPx
    } : null,
    currentMergeMap: { ...centerlineMergedNodes },
    recordCount: routeMergeDebugLog.length,
    records: routeMergeDebugLog
  };

  const filename = `route-merge-debug-${safeFileTimestamp()}.json`;
  const json = JSON.stringify(payload, null, 2);

  try {
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

    if (typeof navigator.msSaveOrOpenBlob === 'function') {
      navigator.msSaveOrOpenBlob(blob, filename);
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // 일부 브라우저는 click 직후 URL을 해제하면 다운로드가 취소될 수 있다.
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (error) {
    console.error('병합 로그 다운로드 실패:', error);
    try {
      localStorage.setItem('route_merge_debug_last_json', json);
    } catch {}

    const popup = window.open('', '_blank');
    if (popup) {
      popup.document.title = filename;
      const pre = popup.document.createElement('pre');
      pre.textContent = json;
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
      popup.document.body.appendChild(pre);
      alert('다운로드가 차단되어 새 창에 로그를 표시했습니다. 전체 내용을 복사해 JSON 파일로 저장하거나 화면을 캡처해 주세요.');
    } else {
      prompt('다운로드가 차단되었습니다. 아래 로그를 복사해 주세요.', json);
    }
  }
}

function ensureRouteMergeDebugControls() {
  if (!isAdminScreen()) return;

  const actions = document.querySelector('.header-actions');
  if (!actions) return;

  let button = document.querySelector('#routeMergeDebugBtn');

  if (!button) {
    button = document.createElement('button');
    button.id = 'routeMergeDebugBtn';
    button.type = 'button';
    button.textContent = '병합 로그 저장';
    actions.prepend(button);
  }

  button.title = '꼭지점 병합 전후 좌표와 선분 길이를 JSON으로 저장';

  if (button.dataset.mergeDebugBound === 'true') return;
  button.dataset.mergeDebugBound = 'true';

  button.addEventListener('click', () => {
    downloadRouteMergeDebugLog();
    if (!routeMergeDebugLog.length) {
      setTimeout(() => alert('병합 기록이 아직 없어 빈 진단 파일을 저장했습니다. 문제 병합을 실행한 뒤 다시 저장해 주세요.'), 50);
    }
  });
}

window.getRouteMergeDebugLog = () => structuredClone(routeMergeDebugLog);
window.downloadRouteMergeDebugLog = downloadRouteMergeDebugLog;

function centerlineNodeKey(cell) {
  if (cell?.isCustom && cell.customKey) {
    return cell.customKey;
  }

  if (cell?.isAutoIntermediate && cell.autoKey) {
    return cell.autoKey;
  }

  return `${cell.row},${cell.col}`;
}

function isAdminScreen() {
  return !!document.querySelector("#xlsxLayoutInput");
}

function isCenterlineNodeDeleted(cell) {
  return centerlineDeletedNodes.has(centerlineNodeKey(cell));
}


function resolveMergedCenterlineKey(key) {
  const visited = new Set();
  let current = key;

  while (
    centerlineMergedNodes[current] &&
    !visited.has(current)
  ) {
    visited.add(current);
    current = centerlineMergedNodes[current];
  }

  return current;
}

function isCenterlineNodeMerged(cell) {
  return !!centerlineMergedNodes[centerlineNodeKey(cell)];
}

function applyCenterlineNodeMerges(skeleton) {
  if (!skeleton?.cells?.length) return skeleton;

  const cells = skeleton.cells;
  const mergeEntries = Object.entries(centerlineMergedNodes || {});

  for (const cell of cells) {
    cell.hiddenByCleanup = false;
  }

  if (!mergeEntries.length) {
    return skeleton;
  }

  /*
   * 링크의 to 값은 "배열 위치"가 아니라 노드 id다. 사용자 노드가 추가되거나
   * 그래프가 재구성된 뒤에는 id와 배열 위치가 항상 같다고 보장할 수 없다.
   * 따라서 cells[link.to]를 사용하지 않고 id 맵으로 실제 노드를 찾는다.
   */
  const cellById = new Map(cells.map((cell) => [cell.id, cell]));
  const cellByKey = skeleton.cellByKey || new Map(
    cells.map((cell) => [centerlineNodeKey(cell), cell])
  );

  const edgeMap = new Map();

  for (const cell of cells) {
    const originalFromKey = centerlineNodeKey(cell);
    const fromKey = resolveMergedCenterlineKey(originalFromKey);

    for (const link of cell.links || []) {
      const linkedCell = cellById.get(link.to);
      if (!linkedCell || linkedCell.id === cell.id) continue;

      const originalToKey = centerlineNodeKey(linkedCell);
      const toKey = resolveMergedCenterlineKey(originalToKey);
      if (!fromKey || !toKey || fromKey === toKey) continue;

      const ordered = fromKey < toKey
        ? [fromKey, toKey]
        : [toKey, fromKey];
      const pairKey = `${ordered[0]}|${ordered[1]}`;

      const previous = edgeMap.get(pairKey);
      const candidateCost = Number(link.cost);
      const previousCost = Number(previous?.cost);

      if (
        !previous ||
        (!Number.isFinite(previousCost) && Number.isFinite(candidateCost)) ||
        (Number.isFinite(candidateCost) && candidateCost < previousCost)
      ) {
        edgeMap.set(pairKey, {
          fromKey: ordered[0],
          toKey: ordered[1],
          originalFromKey,
          originalToKey,
          cost: candidateCost,
          extra: { ...link }
        });
      }
    }
  }

  for (const cell of cells) {
    cell.links = [];
  }

  for (const edge of edgeMap.values()) {
    const first = cellByKey.get(edge.fromKey);
    const second = cellByKey.get(edge.toKey);

    if (
      !first ||
      !second ||
      first.id === second.id ||
      isCenterlineNodeDeleted(first) ||
      isCenterlineNodeDeleted(second)
    ) {
      continue;
    }

    const endpointChanged =
      edge.fromKey !== edge.originalFromKey ||
      edge.toKey !== edge.originalToKey;

    let cost = edge.cost;
    if (endpointChanged || !Number.isFinite(cost) || cost <= 0) {
      const a = centerlinePoint(first);
      const b = centerlinePoint(second);
      cost = Math.max(
        0.0001,
        Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, cellPx)
      );
    }

    addBidirectionalCenterlineLink(first, second, cost, {
      ...(edge.extra || {}),
      mergedFrom: endpointChanged
        ? `${edge.originalFromKey}|${edge.originalToKey}`
        : edge.extra?.mergedFrom
    });
  }

  for (const cell of cells) {
    if (isCenterlineNodeMerged(cell)) {
      cell.links = [];
      cell.hiddenByCleanup = true;
    }
  }

  cleanupCollapsedCenterlineEdges(skeleton);
  return skeleton;
}

function removeLinkBetween(first, second) {
  first.links = first.links.filter(
    (link) => link.to !== second.id
  );

  second.links = second.links.filter(
    (link) => link.to !== first.id
  );
}

function addBidirectionalCenterlineLink(
  first,
  second,
  cost,
  extra = {}
) {
  if (!first || !second || first.id === second.id) {
    return;
  }

  if (!first.links.some((link) => link.to === second.id)) {
    first.links.push({
      ...extra,
      to: second.id,
      cost
    });
  }

  if (!second.links.some((link) => link.to === first.id)) {
    second.links.push({
      ...extra,
      to: first.id,
      cost
    });
  }
}

function cleanupCollapsedCenterlineEdges(skeleton) {
  if (!skeleton?.cells?.length) return skeleton;

  const cells = skeleton.cells;

  /*
   * 삭제되었거나 다른 노드에 병합된 노드는 현재 작업 그래프에서 완전히
   * 비활성화한다. 노드 배열 자체는 id === 배열 인덱스 규칙을 지키기 위해
   * 유지하지만, 모든 링크를 제거하고 렌더링/탐색 대상에서 숨긴다.
   */
  for (const cell of cells) {
    const inactive =
      isCenterlineNodeDeleted(cell) ||
      isCenterlineNodeMerged(cell);

    cell.hiddenByCleanup = inactive;

    if (inactive) {
      cell.links = [];
    }
  }

  /*
   * 활성 노드에서도 삭제·병합 노드, 존재하지 않는 노드, 자기 자신으로 향하는
   * 링크를 실제로 제거한다. 같은 두 노드 사이의 잔여 중복 링크도 하나만 남긴다.
   */
  for (const cell of cells) {
    if (cell.hiddenByCleanup) continue;

    const seenTargets = new Set();

    cell.links = cell.links.filter((link) => {
      const target = cells[link.to];

      if (
        !target ||
        target.id === cell.id ||
        target.hiddenByCleanup ||
        isCenterlineNodeDeleted(target) ||
        isCenterlineNodeMerged(target)
      ) {
        return false;
      }

      if (seenTargets.has(target.id)) {
        return false;
      }

      seenTargets.add(target.id);
      return true;
    });
  }

  /*
   * 한쪽에만 남은 잔여 링크도 제거하여 항상 양방향 그래프를 유지한다.
   */
  for (const cell of cells) {
    if (cell.hiddenByCleanup) continue;

    cell.links = cell.links.filter((link) => {
      const target = cells[link.to];
      return (
        target &&
        !target.hiddenByCleanup &&
        target.links.some((reverse) => reverse.to === cell.id)
      );
    });
  }

  return skeleton;
}

function applyCenterlineCustomNodes(skeleton) {
  if (!skeleton?.cells?.length) return skeleton;

  cleanupCollapsedCenterlineEdges(skeleton);

  for (const [customId, item] of Object.entries(
    centerlineCustomNodes
  )) {
    const fromKey = resolveMergedCenterlineKey(item.from);
    const toKey = resolveMergedCenterlineKey(item.to);

    const first = skeleton.cellByKey?.get(fromKey);
    const second = skeleton.cellByKey?.get(toKey);

    if (
      !first ||
      !second ||
      isCenterlineNodeDeleted(first) ||
      isCenterlineNodeDeleted(second) ||
      isCenterlineNodeMerged(first) ||
      isCenterlineNodeMerged(second)
    ) {
      continue;
    }

    const key = `CUSTOM:${customId}`;
    const override = centerlineOverrides[key];

    const x = Number.isFinite(override?.x)
      ? override.x
      : item.x;

    const y = Number.isFinite(override?.y)
      ? override.y
      : item.y;

    const custom = {
      id: skeleton.cells.length,
      row: y / cellPx + 0.5,
      col: x / cellPx + 0.5,
      links: [],
      customId,
      customKey: key,
      isCustom: true
    };

    skeleton.cells.push(custom);
    skeleton.cellByKey.set(key, custom);

    const firstPoint = centerlinePoint(first);
    const customPoint = { x, y };

    /*
     * 일반적인 경우:
     * 기존 first-second 선을 제거하고 first-custom-second로 분할한다.
     */
    if (first.id !== second.id) {
      removeLinkBetween(first, second);

      const secondPoint = centerlinePoint(second);

      const firstCost =
        Math.hypot(
          customPoint.x - firstPoint.x,
          customPoint.y - firstPoint.y
        ) / cellPx;

      const secondCost =
        Math.hypot(
          secondPoint.x - customPoint.x,
          secondPoint.y - customPoint.y
        ) / cellPx;

      addBidirectionalCenterlineLink(
        first,
        custom,
        firstCost,
        { customSplit: customId }
      );

      addBidirectionalCenterlineLink(
        custom,
        second,
        secondCost,
        { customSplit: customId }
      );

      continue;
    }

    /*
     * 양 끝점이 하나의 대표 노드로 병합된 경우:
     * 중간 사용자 추가점을 삭제하지 않고 대표 노드에 연결해 유지한다.
     * 동일 노드로 돌아가는 불필요한 두 번째 링크는 만들지 않는다.
     */
    const cost =
      Math.hypot(
        customPoint.x - firstPoint.x,
        customPoint.y - firstPoint.y
      ) / cellPx;

    addBidirectionalCenterlineLink(
      first,
      custom,
      cost,
      {
        customSplit: customId,
        preservedAfterMerge: true
      }
    );
  }

  cleanupCollapsedCenterlineEdges(skeleton);
  return skeleton;
}

function findCenterlineMergeTarget(sourceCell) {
  if (!centerlineSkeleton?.cells?.length) return null;

  const sourcePoint = centerlinePoint(sourceCell);
  // 손가락/마우스로 겹쳐 놓을 때 약간의 오차를 허용한다.
  const threshold = Math.max(cellPx * 1.1, 8);

  /*
   * 셀 단위 내부점이 아니라 화면에서 사용하는 논리 선분의 끝점만
   * 병합 후보로 삼는다. 그래야 같은 선 내부의 숨은 셀에 잘못 붙지 않는다.
   */
  const candidates = new Map();
  for (const segment of buildLogicalRouteSegments(centerlineSkeleton)) {
    if (segment?.from) candidates.set(centerlineNodeKey(segment.from), segment.from);
    if (segment?.to) candidates.set(centerlineNodeKey(segment.to), segment.to);
  }
  for (const cell of centerlineSkeleton.cells) {
    if (cell?.isCustom || cell?.isManualEndpoint) {
      candidates.set(centerlineNodeKey(cell), cell);
    }
  }

  const sourceKey = centerlineNodeKey(sourceCell);
  let best = null;
  let bestDistance = Infinity;

  for (const [candidateKey, cell] of candidates) {
    if (
      candidateKey === sourceKey ||
      cell.id === sourceCell.id ||
      isCenterlineNodeDeleted(cell) ||
      isCenterlineNodeMerged(cell)
    ) {
      continue;
    }

    const point = centerlinePoint(cell);
    const distance = Math.hypot(
      point.x - sourcePoint.x,
      point.y - sourcePoint.y
    );

    if (distance <= threshold && distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }

  return best;
}

function mergeCenterlineNodes(sourceCell, targetCell) {
  const debugRecord = routeDebugCreateMergeRecord(sourceCell, targetCell);
  const sourceKey = centerlineNodeKey(sourceCell);
  const targetKey = resolveMergedCenterlineKey(
    centerlineNodeKey(targetCell)
  );

  centerlineMergedNodes[sourceKey] = targetKey;

  /*
   * 합쳐지는 점의 개별 위치 이동값과 삭제값은 제거한다.
   * 최종 위치는 target 점 위치를 사용한다.
   */
  delete centerlineOverrides[sourceKey];
  centerlineDeletedNodes.delete(sourceKey);
  delete centerlineBypasses[sourceKey];

  /*
   * 사용자 추가점은 정의를 삭제하지 않는다. 그래프 재구성 시 해당 점을 먼저
   * 생성한 뒤 병합 단계에서 연결선을 대표 꼭지점으로 넘겨야 선이 사라지지 않는다.
   */

  selectedCenterlineNodeKey = targetKey;
  saveCenterlineOverrides();

  centerlineSkeleton = rebuildEditableCenterlineSkeleton();
  routeDebugFinishMergeRecord(debugRecord, sourceKey, targetKey);

  renderCenterlineDebug();
  routeLine.setAttribute("points", "");
}

function applyCenterlineDeletedNodes(skeleton) {
  if (!skeleton?.cells?.length || !centerlineDeletedNodes.size) {
    return skeleton;
  }

  const cells = skeleton.cells;

  for (const cell of cells) {
    if (!isCenterlineNodeDeleted(cell)) continue;

    const deletedKey = centerlineNodeKey(cell);
    const saved = centerlineBypasses[deletedKey];

    /*
     * 예전 배열 형식과 새 객체 형식을 모두 지원한다.
     */
    const fromKey = Array.isArray(saved)
      ? saved[0]
      : saved?.from;

    const toKey = Array.isArray(saved)
      ? saved[1]
      : saved?.to;

    const viaPoint = Array.isArray(saved)
      ? null
      : saved?.viaPoint || null;

    const first = skeleton.cellByKey?.get(fromKey);
    const second = skeleton.cellByKey?.get(toKey);

    if (
      !first ||
      !second ||
      isCenterlineNodeDeleted(first) ||
      isCenterlineNodeDeleted(second)
    ) {
      continue;
    }

    const a = centerlinePoint(first);
    const b = centerlinePoint(second);

    const safe = viaPoint
      ? (
          centerlineRawSegmentWalkable(a, viaPoint) &&
          centerlineRawSegmentWalkable(viaPoint, b)
        )
      : centerlineRawSegmentWalkable(a, b);

    if (!safe) continue;

    const cost = viaPoint
      ? (
          Math.abs(a.x - viaPoint.x) +
          Math.abs(a.y - viaPoint.y) +
          Math.abs(b.x - viaPoint.x) +
          Math.abs(b.y - viaPoint.y)
        ) / cellPx
      : Math.hypot(b.x - a.x, b.y - a.y) / cellPx;

    if (!first.links.some((link) => link.to === second.id)) {
      first.links.push({
        to: second.id,
        cost,
        viaPoint,
        manualBypass: true
      });
    }

    if (!second.links.some((link) => link.to === first.id)) {
      second.links.push({
        to: first.id,
        cost,
        viaPoint,
        manualBypass: true
      });
    }
  }

  for (const cell of cells) {
    if (isCenterlineNodeDeleted(cell)) {
      cell.links = [];
      continue;
    }

    cell.links = cell.links.filter((link) => {
      const target = cells[link.to];
      return target && !isCenterlineNodeDeleted(target);
    });
  }

  return skeleton;
}



function centerlineRawPointWalkable(point) {
  const col = Math.floor(point.x / cellPx) + 1;
  const row = Math.floor(point.y / cellPx) + 1;
  return isWalkable(row, col);
}

function centerlineRawSegmentWalkable(a, b) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(
    1,
    Math.ceil(distance / Math.max(1, cellPx * 0.2))
  );

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    };

    if (!centerlineRawPointWalkable(point)) {
      return false;
    }
  }

  return true;
}

function centerlinePoint(cell) {
  const key = centerlineNodeKey(cell);
  const override = centerlineOverrides[key];

  if (
    override &&
    Number.isFinite(override.x) &&
    Number.isFinite(override.y)
  ) {
    return {
      x: override.x,
      y: override.y
    };
  }

  if (cell?.isCustom || cell?.isAutoIntermediate) {
    return {
      x: (cell.col - 0.5) * cellPx,
      y: (cell.row - 0.5) * cellPx
    };
  }

  return gridPoint(cell.row, cell.col);
}

function isCenterlineKeyNode(cell, cells) {
  const neighbors = cell.links
    .map((link) => cells[link.to])
    .filter(
      (target) =>
        target &&
        !isCenterlineNodeDeleted(target) &&
        !isCenterlineNodeMerged(target)
    );

  /*
   * 핵심 노드:
   * - 마무리점: 연결선 1개 이하
   * - 교차점: 연결선 3개 이상
   * - 꺾임점: 연결선은 2개지만 두 선이 같은 경로가 아님
   *
   * 중간점:
   * - 연결선이 2개이고 가로 또는 세로로 일직선인 점
   */
  if (neighbors.length !== 2) {
    return true;
  }

  const current = centerlinePoint(cell);
  const first = centerlinePoint(neighbors[0]);
  const second = centerlinePoint(neighbors[1]);

  const sameHorizontal =
    Math.abs(first.y - current.y) < 0.01 &&
    Math.abs(second.y - current.y) < 0.01;

  const sameVertical =
    Math.abs(first.x - current.x) < 0.01 &&
    Math.abs(second.x - current.x) < 0.01;

  return !(sameHorizontal || sameVertical);
}



function activeCenterlineNeighbors(cell, skeleton) {
  return cell.links
    .map((link) => skeleton.cells[link.to])
    .filter(
      (target) =>
        target &&
        !isCenterlineNodeDeleted(target) &&
        !isCenterlineNodeMerged(target) &&
        !target.hiddenByCleanup
    );
}

function analyzeCenterlineConnectivity(skeleton) {
  centerlineDisconnectedNodeIds = new Set();
  centerlineDisconnectedComponents = [];

  if (!skeleton?.cells?.length) {
    return {
      components: [],
      disconnectedComponents: [],
      disconnectedNodeIds: centerlineDisconnectedNodeIds
    };
  }

  const cells = skeleton.cells;

  const activeCells = cells.filter(
    (cell) =>
      !isCenterlineNodeDeleted(cell) &&
      !isCenterlineNodeMerged(cell) &&
      !cell.hiddenByCleanup &&
      cell.links.some((link) => {
        const target = cells[link.to];
        return (
          target &&
          !isCenterlineNodeDeleted(target) &&
          !isCenterlineNodeMerged(target) &&
          !target.hiddenByCleanup
        );
      })
  );

  const activeIds = new Set(
    activeCells.map((cell) => cell.id)
  );

  const visited = new Set();
  const components = [];

  for (const start of activeCells) {
    if (visited.has(start.id)) continue;

    const component = [];
    const queue = [start.id];
    visited.add(start.id);

    for (let head = 0; head < queue.length; head++) {
      const currentId = queue[head];
      const current = cells[currentId];

      if (!current) continue;
      component.push(current);

      for (const link of current.links) {
        if (
          !activeIds.has(link.to) ||
          visited.has(link.to)
        ) {
          continue;
        }

        visited.add(link.to);
        queue.push(link.to);
      }
    }

    components.push(component);
  }

  components.sort((a, b) => b.length - a.length);

  /*
   * 가장 큰 연결망을 주 동선으로 간주하고,
   * 나머지 연결망을 끊어진 동선으로 표시한다.
   */
  const disconnectedComponents = components.slice(1);

  for (const component of disconnectedComponents) {
    for (const cell of component) {
      centerlineDisconnectedNodeIds.add(cell.id);
    }
  }

  centerlineDisconnectedComponents =
    disconnectedComponents;

  return {
    components,
    disconnectedComponents,
    disconnectedNodeIds: centerlineDisconnectedNodeIds
  };
}

function focusDisconnectedComponent(index = 0) {
  const component = centerlineDisconnectedComponents[index];
  if (!component?.length) return false;

  const points = component.map((cell) => centerlinePoint(cell));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const padding = Math.max(cellPx * 8, 42);
  const desiredWidth = Math.max(maxX - minX + padding * 2, fullViewBox.width * 0.16);
  const desiredHeight = Math.max(maxY - minY + padding * 2, fullViewBox.height * 0.16);
  const aspect = Math.max(0.1, floorMap.clientWidth / Math.max(1, floorMap.clientHeight));
  let width = desiredWidth;
  let height = desiredHeight;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  width = Math.min(width, fullViewBox.width);
  height = Math.min(height, fullViewBox.height);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  currentViewBox = {
    x: Math.max(0, Math.min(fullViewBox.width - width, centerX - width / 2)),
    y: Math.max(0, Math.min(fullViewBox.height - height, centerY - height / 2)),
    width,
    height
  };
  applyViewBox();
  routeInfo.textContent = `연결 이상 ${index + 1}/${centerlineDisconnectedComponents.length}: 분리된 노드 ${component.length}개를 표시했습니다.`;
  return true;
}

function ensureCenterlineConnectivityStatus() {
  if (!isAdminScreen()) return null;

  const toolbar = document.querySelector(".map-actions");
  if (!toolbar) return null;

  if (!document.querySelector("#centerlineIssueStyles")) {
    const style = document.createElement("style");
    style.id = "centerlineIssueStyles";
    style.textContent = `
      @keyframes routeIssuePulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: .45; transform: scale(1.45); }
      }
      .route-issue-pulse {
        transform-box: fill-box;
        transform-origin: center;
        animation: routeIssuePulse 1.05s ease-in-out infinite;
        pointer-events: none;
      }
      #centerlineConnectivityStatus.warning {
        font-weight: 800;
        box-shadow: 0 0 0 3px rgba(220,38,38,.16);
      }
    `;
    document.head.appendChild(style);
  }

  let status = document.querySelector("#centerlineConnectivityStatus");

  if (!status) {
    status = document.createElement("button");
    status.id = "centerlineConnectivityStatus";
    status.type = "button";
    status.title = "연결 이상 구간으로 이동합니다.";

    status.addEventListener("click", () => {
      if (!centerlineDisconnectedComponents.length) {
        routeInfo.textContent = "모든 동선 노드가 하나로 연결되어 있습니다.";
        return;
      }
      centerlineIssueFocusIndex %= centerlineDisconnectedComponents.length;
      focusDisconnectedComponent(centerlineIssueFocusIndex);
      centerlineIssueFocusIndex =
        (centerlineIssueFocusIndex + 1) % centerlineDisconnectedComponents.length;
    });

    toolbar.prepend(status);
  }

  return status;
}

function updateCenterlineConnectivityStatus(skeleton) {
  const result = analyzeCenterlineConnectivity(skeleton);
  const status = ensureCenterlineConnectivityStatus();

  if (!status) return result;

  const count = result.disconnectedComponents.length;

  if (count > 0) {
    status.textContent = `연결 이상 ${count} · 위치 보기`;
    status.classList.add("warning");
    status.style.borderColor = "#dc2626";
    status.style.color = "#b91c1c";
    status.style.background = "#fff7ed";
  } else {
    status.textContent = "동선 연결 정상";
    status.classList.remove("warning");
    status.style.borderColor = "#86efac";
    status.style.color = "#166534";
    status.style.background = "#f0fdf4";
  }

  return result;
}





function routeEdgeKey(first, second) {
  return [centerlineNodeKey(first), centerlineNodeKey(second)].sort().join("|");
}


function routeLinkDirection(first, second) {
  const a = centerlinePoint(first);
  const b = centerlinePoint(second);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy) * 2) return "h";
  if (Math.abs(dy) > Math.abs(dx) * 2) return "v";
  return "d";
}

function isNearlyStraightRouteVertex(cell, first, second) {
  if (!cell || !first || !second) return false;
  const p = centerlinePoint(cell);
  const a = centerlinePoint(first);
  const b = centerlinePoint(second);
  const ax = a.x - p.x;
  const ay = a.y - p.y;
  const bx = b.x - p.x;
  const by = b.y - p.y;
  const lenA = Math.hypot(ax, ay);
  const lenB = Math.hypot(bx, by);
  if (lenA < 0.001 || lenB < 0.001) return true;

  // 두 벡터가 서로 반대 방향(180도)에 가까우면 한 직선의 중간점이다.
  const dot = (ax * bx + ay * by) / (lenA * lenB);
  const cross = Math.abs(ax * by - ay * bx) / (lenA * lenB);
  const lineDistance = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y))
    / Math.max(0.001, Math.hypot(b.x - a.x, b.y - a.y));

  return dot <= -0.985 && cross <= 0.17 && lineDistance <= Math.max(1.5, cellPx * 0.18);
}

function activeDistinctRouteNeighbors(cell, cells) {
  if (!cell) return [];
  const result = [];
  const seen = new Set();

  for (const link of cell.links || []) {
    const other = cells[link.to];
    if (!other) continue;
    if (routeDeletedEdges.has(routeEdgeKey(cell, other))) continue;
    if (isCenterlineNodeDeleted(other)) continue;

    const resolvedKey = resolveMergedCenterlineKey(centerlineNodeKey(other));
    const point = centerlinePoint(other);
    const positionKey = `${Math.round(point.x * 10) / 10}:${Math.round(point.y * 10) / 10}`;
    const uniqueKey = `${resolvedKey}|${positionKey}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    result.push(other);
  }

  return result;
}

function isStraightThroughRouteVertex(cell, first, second) {
  if (!cell || !first || !second) return false;
  const p = centerlinePoint(cell);
  const a = centerlinePoint(first);
  const b = centerlinePoint(second);
  const tolerance = Math.max(2.2, cellPx * 0.28);

  const sameVertical = Math.abs(a.x - p.x) <= tolerance
    && Math.abs(b.x - p.x) <= tolerance
    && (a.y - p.y) * (b.y - p.y) <= 0;
  const sameHorizontal = Math.abs(a.y - p.y) <= tolerance
    && Math.abs(b.y - p.y) <= tolerance
    && (a.x - p.x) * (b.x - p.x) <= 0;
  if (sameVertical || sameHorizontal) return true;

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;
  if (lengthSquared < 0.001) return true;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSquared;
  if (t < -0.02 || t > 1.02) return false;
  const projectedX = a.x + abx * t;
  const projectedY = a.y + aby * t;
  return Math.hypot(p.x - projectedX, p.y - projectedY) <= tolerance;
}

/*
 * 원시 중앙선은 엑셀 셀을 1칸씩 이어 만든 그래프다.
 * 편집 화면에서는 이 원시 셀을 꼭지점으로 사용하지 않고,
 * 연결 차수가 2가 아닌 실제 끝점/교차점만 위상 꼭지점으로 사용한다.
 * 꺾임점은 한 경로 체인을 벡터로 단순화한 뒤 별도로 만든다.
 */
function isRouteTopologyAnchor(cell, cells) {
  if (!cell) return true;
  if (cell.isCustom || cell.isManualEndpoint) return true;
  return activeDistinctRouteNeighbors(cell, cells).length !== 2;
}

function pointLineDistance(point, first, second) {
  return projectPointToSegment(point, first, second).distance;
}

function simplifyRouteChainIndices(chain) {
  if (!chain?.length) return [];
  if (chain.length <= 2) return chain.map((_, index) => index);

  const points = chain.map((cell) => centerlinePoint(cell));
  const tolerance = Math.max(4, cellPx * 0.82);
  const keep = new Set([0, points.length - 1]);

  function simplify(firstIndex, lastIndex) {
    if (lastIndex <= firstIndex + 1) return;
    let bestIndex = -1;
    let bestDistance = -1;
    const first = points[firstIndex];
    const last = points[lastIndex];

    for (let index = firstIndex + 1; index < lastIndex; index++) {
      const distance = pointLineDistance(points[index], first, last);
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestDistance > tolerance && bestIndex > firstIndex) {
      keep.add(bestIndex);
      simplify(firstIndex, bestIndex);
      simplify(bestIndex, lastIndex);
    }
  }

  simplify(0, points.length - 1);
  let indices = [...keep].sort((a, b) => a - b);

  // 셀 단위 지그재그로 생긴 매우 짧은 중간 조각은 다시 제거한다.
  let changed = true;
  while (changed && indices.length > 2) {
    changed = false;
    for (let i = 1; i < indices.length - 1; i++) {
      const before = points[indices[i - 1]];
      const current = points[indices[i]];
      const after = points[indices[i + 1]];
      const firstLength = Math.hypot(current.x - before.x, current.y - before.y);
      const secondLength = Math.hypot(after.x - current.x, after.y - current.y);
      const deviation = pointLineDistance(current, before, after);
      if (
        deviation <= Math.max(3, cellPx * 0.55) ||
        Math.min(firstLength, secondLength) <= Math.max(5, cellPx * 0.8)
      ) {
        indices.splice(i, 1);
        changed = true;
        break;
      }
    }
  }

  return indices;
}

function routeChainLength(chain) {
  let total = 0;
  for (let index = 1; index < (chain?.length || 0); index++) {
    const first = centerlinePoint(chain[index - 1]);
    const second = centerlinePoint(chain[index]);
    total += Math.hypot(second.x - first.x, second.y - first.y);
  }
  return total;
}

function isMinorAutomaticRouteSpur(chain, cells) {
  if (!chain?.length || chain.length < 2) return false;
  if (chain.some((cell) => cell.isCustom || cell.isManualEndpoint)) return false;
  const firstDegree = activeDistinctRouteNeighbors(chain[0], cells).length;
  const lastDegree = activeDistinctRouteNeighbors(chain[chain.length - 1], cells).length;
  const hasDeadEnd = firstDegree <= 1 || lastDegree <= 1;
  return hasDeadEnd && routeChainLength(chain) <= Math.max(14, cellPx * 2.25);
}

function isLogicalRouteVertex(cell, cells) {
  if (!cell) return true;
  return isRouteTopologyAnchor(cell, cells);
}

function buildLogicalRouteSegments(skeleton = centerlineSkeleton) {
  if (!skeleton?.cells?.length) return [];
  const cells = skeleton.cells;
  const visitedEdges = new Set();
  const segments = [];
  const edgeKeyByIds = (a, b) => [Math.min(a, b), Math.max(a, b)].join(":");

  function emitVectorPieces(chain, chainEdgeKeys) {
    if (chain.length < 2 || isMinorAutomaticRouteSpur(chain, cells)) return;
    const indices = simplifyRouteChainIndices(chain);
    if (indices.length < 2) return;

    for (let pieceIndex = 0; pieceIndex < indices.length - 1; pieceIndex++) {
      const fromIndex = indices[pieceIndex];
      const toIndex = indices[pieceIndex + 1];
      if (toIndex <= fromIndex) continue;
      const pieceCells = chain.slice(fromIndex, toIndex + 1);
      const pieceEdgeKeys = chainEdgeKeys.slice(fromIndex, toIndex);
      const from = pieceCells[0];
      const to = pieceCells[pieceCells.length - 1];
      const fromKey = centerlineNodeKey(from);
      const toKey = centerlineNodeKey(to);
      const id = `${[fromKey, toKey].sort().join("~")}#${pieceIndex}`;
      segments.push({
        id,
        cells: pieceCells,
        edgeKeys: pieceEdgeKeys,
        from,
        to,
        points: [centerlinePoint(from), centerlinePoint(to)],
        vectorized: true
      });
    }
  }

  function walk(start, next) {
    const chain = [start];
    const edgeKeys = [];
    let previous = start;
    let current = next;
    const safety = new Set();

    while (current) {
      const pair = edgeKeyByIds(previous.id, current.id);
      if (visitedEdges.has(pair) || safety.has(pair)) break;
      safety.add(pair);
      visitedEdges.add(pair);
      edgeKeys.push(routeEdgeKey(previous, current));
      chain.push(current);

      if (isRouteTopologyAnchor(current, cells) && current.id !== start.id) break;
      const candidates = activeDistinctRouteNeighbors(current, cells)
        .filter((candidate) => candidate.id !== previous.id);
      if (candidates.length !== 1) break;
      previous = current;
      current = candidates[0];
    }

    emitVectorPieces(chain, edgeKeys);
  }

  // 실제 끝점/교차점에서 출발해 차수 2인 셀을 전부 통과한다.
  for (const cell of cells) {
    if (!isRouteTopologyAnchor(cell, cells)) continue;
    for (const link of cell.links || []) {
      const target = cells[link.to];
      if (!target) continue;
      const pair = edgeKeyByIds(cell.id, target.id);
      if (!visitedEdges.has(pair)) walk(cell, target);
    }
  }

  // 폐쇄 고리처럼 위상 꼭지점이 없는 경로도 누락하지 않는다.
  for (const cell of cells) {
    for (const link of cell.links || []) {
      const target = cells[link.to];
      if (!target) continue;
      const pair = edgeKeyByIds(cell.id, target.id);
      if (!visitedEdges.has(pair)) walk(cell, target);
    }
  }

  return segments;
}

function isRouteSegmentClosed(segment) {
  return !!segment?.edgeKeys?.length && segment.edgeKeys.every((key) => routeClosedEdges.has(key));
}

function nearestRouteCell(row, col, skeleton = centerlineSkeleton) {
  if (!skeleton?.cells?.length) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const cell of skeleton.cells) {
    if (isCenterlineNodeDeleted(cell) || isCenterlineNodeMerged(cell)) continue;
    const distance = Math.abs(cell.row - row) + Math.abs(cell.col - col);
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best;
}


function projectPointToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) {
    return { x: a.x, y: a.y, t: 0, distance: Math.hypot(point.x - a.x, point.y - a.y) };
  }
  const rawT = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const x = a.x + dx * t;
  const y = a.y + dy * t;
  return { x, y, t, distance: Math.hypot(point.x - x, point.y - y) };
}

function routeTopologyVertices(skeleton = centerlineSkeleton) {
  if (!skeleton?.cells?.length) return [];
  const vertices = new Map();
  for (const segment of buildLogicalRouteSegments(skeleton)) {
    for (const cell of [segment.from, segment.to]) {
      if (!cell || isCenterlineNodeDeleted(cell) || isCenterlineNodeMerged(cell)) continue;
      vertices.set(centerlineNodeKey(cell), cell);
    }
  }
  return [...vertices.values()];
}

function rawEdgeAtLogicalSegmentPoint(segment, point) {
  if (!segment?.cells?.length || segment.cells.length < 2) return null;
  let best = null;
  for (let index = 0; index < segment.cells.length - 1; index++) {
    const first = segment.cells[index];
    const second = segment.cells[index + 1];
    const a = centerlinePoint(first);
    const b = centerlinePoint(second);
    const projected = projectPointToSegment(point, a, b);
    if (!best || projected.distance < best.distance) {
      best = { first, second, distance: projected.distance };
    }
  }
  return best;
}

function nearestRouteGeometryAnchor(point, skeleton = centerlineSkeleton, maxDistance = null, options = {}) {
  if (!skeleton?.cells?.length) return null;
  const threshold = maxDistance ?? Math.max(cellPx * 3.2, 18);
  const excludeIds = new Set(options.excludeIds || []);
  let best = null;

  /*
   * 편집 접점은 원시 골격 셀이 아니라 위상 꼭지점만 대상으로 한다.
   * 원시 골격의 중간 셀에 붙으면 선이 짧아지거나 불필요한 꼭지점이 생기므로,
   * 끝점·교차점·꺾임점만 노드 후보로 사용한다.
   */
  for (const cell of routeTopologyVertices(skeleton)) {
    if (excludeIds.has(cell.id)) continue;
    const p = centerlinePoint(cell);
    const distance = Math.hypot(p.x - point.x, p.y - point.y);
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { type: "node", cell, point: p, distance };
    }
  }

  /*
   * 선 중간 접점은 논리 선분 전체에 투영한다. 실제 그래프를 분할할 때만
   * 해당 위치와 가장 가까운 원시 링크를 찾아 사용한다.
   */
  for (const segment of buildLogicalRouteSegments(skeleton)) {
    if (!segment?.from || !segment?.to) continue;
    if (excludeIds.has(segment.from.id) || excludeIds.has(segment.to.id)) continue;

    const a = centerlinePoint(segment.from);
    const b = centerlinePoint(segment.to);
    const projected = projectPointToSegment(point, a, b);
    if (projected.t <= 0.04 || projected.t >= 0.96) continue;
    if (projected.distance > threshold || (best && projected.distance >= best.distance)) continue;

    const rawEdge = rawEdgeAtLogicalSegmentPoint(segment, projected);
    if (!rawEdge) continue;

    best = {
      type: "edge",
      first: rawEdge.first,
      second: rawEdge.second,
      logicalSegment: segment,
      point: { x: projected.x, y: projected.y },
      distance: projected.distance,
      t: projected.t
    };
  }
  return best;
}


function normalizeJointVectorGraph(graph) {
  if (!graph || !Array.isArray(graph.vertices) || !Array.isArray(graph.segments)) return null;
  const vertices = [];
  const seenVertices = new Set();
  for (const vertex of graph.vertices) {
    const id = String(vertex?.id || '').trim();
    const x = Number(vertex?.x);
    const y = Number(vertex?.y);
    if (!id || seenVertices.has(id) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    seenVertices.add(id);
    vertices.push({ id, x, y });
  }
  const vertexIds = new Set(vertices.map((vertex) => vertex.id));
  const segments = [];
  const seenSegments = new Set();
  for (const segment of graph.segments) {
    const source = String(segment?.source || '').trim();
    const target = String(segment?.target || '').trim();
    if (!vertexIds.has(source) || !vertexIds.has(target) || source === target) continue;
    const pairKey = [source, target].sort().join('~');
    if (seenSegments.has(pairKey)) continue;
    seenSegments.add(pairKey);
    segments.push({
      id: String(segment?.id || `vector-${segments.length + 1}`),
      source,
      target,
      closed: segment?.closed === true
    });
  }
  return {
    version: 1,
    vertices,
    segments,
    updatedAt: graph.updatedAt || new Date().toISOString()
  };
}

function buildSkeletonFromJointVectorGraph(graph) {
  const normalized = normalizeJointVectorGraph(graph);
  if (!normalized?.vertices?.length) return null;

  const cells = normalized.vertices.map((vertex, index) => ({
    id: index,
    row: vertex.y / cellPx + 0.5,
    col: vertex.x / cellPx + 0.5,
    links: [],
    isCustom: true,
    isVectorVertex: true,
    customKey: `VECTOR:${vertex.id}`,
    vectorId: vertex.id
  }));
  const indexByVectorId = new Map(cells.map((cell, index) => [cell.vectorId, index]));

  for (const segment of normalized.segments) {
    if (segment.closed === true) continue;
    const sourceIndex = indexByVectorId.get(segment.source);
    const targetIndex = indexByVectorId.get(segment.target);
    if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex) || sourceIndex === targetIndex) continue;
    const source = cells[sourceIndex];
    const target = cells[targetIndex];
    const dx = (target.col - source.col) * cellPx;
    const dy = (target.row - source.row) * cellPx;
    const cost = Math.max(0.0001, Math.hypot(dx, dy) / Math.max(1, cellPx));
    source.links.push({ to: targetIndex, cost, vectorSegmentId: segment.id });
    target.links.push({ to: sourceIndex, cost, vectorSegmentId: segment.id });
  }

  const cellByKey = new Map(cells.map((cell) => [centerlineNodeKey(cell), cell]));
  return {
    cells,
    cellByKey,
    source: 'joint-vector',
    vectorGraph: normalized
  };
}

function exportCurrentJointVectorGraph() {
  if (jointVectorRouteGraph?.vertices?.length) {
    return structuredClone(jointVectorRouteGraph);
  }

  const skeleton = rebuildEditableCenterlineSkeleton({ ignoreJointVector: true });
  const segments = buildLogicalRouteSegments(skeleton);
  const vertices = new Map();
  const exportedSegments = [];

  for (const segment of segments) {
    if (!segment?.from || !segment?.to) continue;
    const source = centerlineNodeKey(segment.from);
    const target = centerlineNodeKey(segment.to);
    if (source === target) continue;
    const sourcePoint = centerlinePoint(segment.from);
    const targetPoint = centerlinePoint(segment.to);
    vertices.set(source, { id: source, x: sourcePoint.x, y: sourcePoint.y });
    vertices.set(target, { id: target, x: targetPoint.x, y: targetPoint.y });
    exportedSegments.push({ id: segment.id, source, target });
  }

  return normalizeJointVectorGraph({
    version: 1,
    vertices: [...vertices.values()],
    segments: exportedSegments,
    updatedAt: new Date().toISOString()
  });
}

function applyJointVectorGraph(graph) {
  const normalized = normalizeJointVectorGraph(graph);
  if (!normalized?.vertices?.length || !normalized?.segments?.length) {
    alert('적용할 벡터 경로에 꼭지점 또는 선분이 없습니다.');
    return false;
  }
  jointVectorRouteGraph = normalized;
  storage.setJson(JOINT_VECTOR_ROUTE_KEY, normalized);
  centerlineSkeleton = null;
  selectedCenterlineNodeKey = null;
  selectedRouteSegmentId = null;
  selectedRouteSegment = null;
  renderCenterlineDebug();
  broadcastLocalStateChange('joint-vector-route');
  return true;
}

function clearJointVectorGraph() {
  jointVectorRouteGraph = null;
  storage.removeItem(JOINT_VECTOR_ROUTE_KEY);
  centerlineSkeleton = null;
  selectedCenterlineNodeKey = null;
  selectedRouteSegmentId = null;
  selectedRouteSegment = null;
  renderCenterlineDebug();
  broadcastLocalStateChange('joint-vector-route-clear');
}

function exportJointEditorCanvasInfo() {
  const svg = document.querySelector("#floorMap");
  if (!svg) return { width: 1200, height: 800, backgroundDataUrl: null };
  const viewBox = svg.viewBox?.baseVal;
  const width = Math.max(1, Number(viewBox?.width) || 1000);
  const height = Math.max(1, Number(viewBox?.height) || 650);
  try {
    const clone = svg.cloneNode(true);
    clone.removeAttribute("style");
    clone.querySelectorAll("#routeLine,#startMarker,#destinationMarker,.route-line,.start-marker,.destination-marker,[data-centerline-node],[data-route-segment],.centerline-debug,.route-debug").forEach((node) => node.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    const xml = new XMLSerializer().serializeToString(clone);
    return {
      width,
      height,
      backgroundDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
    };
  } catch (error) {
    console.warn("[vector editor background]", error);
    return { width, height, backgroundDataUrl: null };
  }
}

window.ExhibitionJointRouteBridge = Object.freeze({
  exportCurrentGraph: exportCurrentJointVectorGraph,
  applyVectorGraph: applyJointVectorGraph,
  clearVectorGraph: clearJointVectorGraph,
  hasVectorGraph: () => !!jointVectorRouteGraph?.vertices?.length,
  getCanvasInfo: exportJointEditorCanvasInfo
});

function rebuildEditableCenterlineSkeleton(options = {}) {
  if (!options.ignoreJointVector && jointVectorRouteGraph?.vertices?.length) {
    const vectorSkeleton = buildSkeletonFromJointVectorGraph(jointVectorRouteGraph);
    if (vectorSkeleton) return vectorSkeleton;
  }
  /*
   * 중요: 병합은 그래프 구성의 맨 마지막에 정확히 한 번만 적용한다.
   * 이전 구현은 자동 골격에 한 번, 수동 경로 추가 후 다시 한 번 적용하면서
   * 첫 번째 병합에서 비활성화된 노드를 두 번째 재배선의 원본으로 사용했다.
   * 그 결과 대표 꼭지점의 링크까지 모두 비워지는 경우가 있었다.
   */
  centerlineSkeleton = applyCenterlineDeletedNodes(
    buildSingleCenterlineSkeleton()
  );

  centerlineSkeleton = applyCenterlineCustomNodes(
    centerlineSkeleton
  );

  centerlineSkeleton = applyManualRouteSegments(
    centerlineSkeleton
  );

  centerlineSkeleton = applyCenterlineNodeMerges(
    centerlineSkeleton
  );

  // 모든 편집 단계를 적용한 뒤 잔여 링크를 최종적으로 실제 제거한다.
  cleanupCollapsedCenterlineEdges(centerlineSkeleton);
  return centerlineSkeleton;
}

function materializeRouteGeometryAnchor(anchor) {
  if (!anchor) return null;
  if (anchor.type === "node") return anchor.cell;
  if (anchor.type !== "edge" || !anchor.first || !anchor.second) return null;

  const from = centerlineNodeKey(anchor.first);
  const to = centerlineNodeKey(anchor.second);
  const existing = Object.entries(centerlineCustomNodes).find(([, item]) => {
    const sameEdge = (item.from === from && item.to === to) || (item.from === to && item.to === from);
    return sameEdge && Math.hypot(Number(item.x) - anchor.point.x, Number(item.y) - anchor.point.y) <= Math.max(1, cellPx * 0.18);
  });
  let customId;
  if (existing) {
    customId = existing[0];
  } else {
    customId = `J${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
    centerlineCustomNodes[customId] = {
      from,
      to,
      x: anchor.point.x,
      y: anchor.point.y,
      autoJunction: true
    };
    saveCenterlineOverrides();
  }

  rebuildEditableCenterlineSkeleton();
  return centerlineSkeleton?.cellByKey?.get(`CUSTOM:${customId}`) || null;
}

function findAxisRouteAnchor(firstPoint, desiredPoint, skeleton = centerlineSkeleton, maxDistance = null) {
  if (!skeleton?.cells?.length) return null;
  const threshold = maxDistance ?? Math.max(cellPx * 2.6, 16);
  const horizontal = Math.abs(desiredPoint.x - firstPoint.x) >= Math.abs(desiredPoint.y - firstPoint.y);
  let best = null;

  const consider = (anchorPoint, payload) => {
    const axisError = horizontal
      ? Math.abs(anchorPoint.y - firstPoint.y)
      : Math.abs(anchorPoint.x - firstPoint.x);
    if (axisError > threshold) return;
    const target = horizontal
      ? { x: anchorPoint.x, y: firstPoint.y }
      : { x: firstPoint.x, y: anchorPoint.y };
    const clickDistance = Math.hypot(target.x - desiredPoint.x, target.y - desiredPoint.y);
    const score = clickDistance + axisError * 1.8;
    if (!best || score < best.score) best = { ...payload, point: target, score };
  };

  for (const cell of skeleton.cells) {
    if (isCenterlineNodeDeleted(cell) || isCenterlineNodeMerged(cell)) continue;
    consider(centerlinePoint(cell), { type: "node", cell });
  }

  const visited = new Set();
  for (const first of skeleton.cells) {
    for (const link of first.links || []) {
      const second = skeleton.cells[link.to];
      if (!second) continue;
      const pair = [Math.min(first.id, second.id), Math.max(first.id, second.id)].join(":");
      if (visited.has(pair)) continue;
      visited.add(pair);
      const a = centerlinePoint(first);
      const b = centerlinePoint(second);

      if (horizontal) {
        const y = firstPoint.y;
        if (Math.abs(a.x - b.x) < Math.abs(a.y - b.y)) {
          const minY = Math.min(a.y, b.y) - threshold;
          const maxY = Math.max(a.y, b.y) + threshold;
          if (y >= minY && y <= maxY) {
            const t = Math.abs(b.y-a.y) < 1e-9 ? 0 : (y-a.y)/(b.y-a.y);
            if (t > 0.03 && t < 0.97) consider({ x: a.x+(b.x-a.x)*t, y }, { type:"edge", first, second });
          }
        }
      } else {
        const x = firstPoint.x;
        if (Math.abs(a.y - b.y) < Math.abs(a.x - b.x)) {
          const minX = Math.min(a.x, b.x) - threshold;
          const maxX = Math.max(a.x, b.x) + threshold;
          if (x >= minX && x <= maxX) {
            const t = Math.abs(b.x-a.x) < 1e-9 ? 0 : (x-a.x)/(b.x-a.x);
            if (t > 0.03 && t < 0.97) consider({ x, y: a.y+(b.y-a.y)*t }, { type:"edge", first, second });
          }
        }
      }
    }
  }
  return best;
}

function autoJoinCenterlineNodeToTouchedRoute(sourceCell) {
  if (!sourceCell || !centerlineSkeleton) return false;

  const sourcePoint = centerlinePoint(sourceCell);
  const incidentIds = [
    sourceCell.id,
    ...(sourceCell.links || []).map((link) => link.to)
  ];

  const anchor = nearestRouteGeometryAnchor(
    sourcePoint,
    centerlineSkeleton,
    Math.max(cellPx * 1.15, 8),
    { excludeIds: incidentIds }
  );

  if (!anchor) return false;

  const message = anchor.type === "node"
    ? "두 경로 꼭지점이 서로 닿았습니다.\n\n두 점을 하나로 합쳐 연결하시겠습니까?\n합치면 두 점에 연결된 모든 경로가 하나의 꼭지점으로 이어집니다."
    : "이 꼭지점이 기존 경로 선에 닿았습니다.\n\n해당 위치에 교차점을 만들고 경로를 연결하시겠습니까?";

  if (!confirm(message)) {
    return null;
  }

  const sourceKey = centerlineNodeKey(sourceCell);
  let target = null;

  if (anchor.type === "node") {
    const targetKey = centerlineNodeKey(anchor.cell);
    target = centerlineSkeleton?.cellByKey?.get(targetKey) || anchor.cell;
  } else {
    target = materializeRouteGeometryAnchor(anchor);
  }
  if (!target) return false;

  const rebuiltSource = centerlineSkeleton?.cellByKey?.get(sourceKey);
  const rebuiltTarget = centerlineSkeleton?.cellByKey?.get(centerlineNodeKey(target)) || target;
  if (!rebuiltSource || !rebuiltTarget || rebuiltSource.id === rebuiltTarget.id) return false;

  mergeCenterlineNodes(rebuiltSource, rebuiltTarget);
  cleanupCollapsedCenterlineEdges(centerlineSkeleton);
  return true;
}

function nearestRouteAnchor(point, skeleton = centerlineSkeleton, maxDistance = null) {
  const anchor = nearestRouteGeometryAnchor(point, skeleton, maxDistance);
  if (!anchor) return null;
  if (anchor.type === "node") return { cell: anchor.cell, distance: anchor.distance, type: "node" };
  return { ...anchor, cell: null };
}

function validateRouteSegmentWalkability(first, second) {
  if (!first || !second) {
    return { ok: false, reason: "시작점 또는 끝점을 확인하지 못했습니다." };
  }

  const a = centerlinePoint(first);
  const b = centerlinePoint(second);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const axisTolerance = Math.max(0.5, cellPx * 0.08);

  if (Math.abs(dx) > axisTolerance && Math.abs(dy) > axisTolerance) {
    return { ok: false, reason: "새 경로는 수평 또는 수직 직선으로만 만들 수 있습니다." };
  }

  const length = Math.hypot(dx, dy);
  if (length < Math.max(1, cellPx * 0.25)) {
    return { ok: false, reason: "시작점과 끝점이 너무 가깝습니다. 다른 위치를 선택하세요." };
  }

  // 분수 좌표의 교차점도 안전하게 검사하도록 픽셀 좌표를 일정 간격으로 샘플링한다.
  const steps = Math.max(1, Math.ceil(length / Math.max(1, cellPx * 0.32)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    const row = Math.floor(y / cellPx) + 1;
    const col = Math.floor(x / cellPx) + 1;
    if (!isWalkable(row, col)) {
      return {
        ok: false,
        reason: `선택한 직선이 복도가 아닌 영역을 통과합니다. (${col}열 ${row}행 부근)`
      };
    }
  }

  return { ok: true, reason: "" };
}

function segmentCellsWalkable(first, second) {
  return validateRouteSegmentWalkability(first, second).ok;
}

function ensureManualRouteEndpoint(skeleton, endpoint) {
  if (!endpoint) return null;

  /*
   * 수동 경로 끝점도 꼭지점 병합 기록을 반드시 따른다.
   * 이전에는 endpoint.key 원본을 그대로 조회해서, 병합된 수동 끝점이
   * 다음 렌더링 때 원래 위치에 다시 생성되는 문제가 있었다.
   */
  const originalKey = endpoint.key || null;
  const resolvedKey = originalKey
    ? resolveMergedCenterlineKey(originalKey)
    : null;

  if (resolvedKey) {
    const existing = skeleton.cellByKey?.get(resolvedKey);
    if (existing) return existing;
  }

  if (!Number.isFinite(endpoint.x) || !Number.isFinite(endpoint.y)) return null;
  const key = resolvedKey || originalKey || `MANUAL:${endpoint.id || Math.random().toString(36).slice(2)}`;
  let cell = skeleton.cellByKey?.get(key);
  if (cell) return cell;
  cell = {
    id: skeleton.cells.length,
    row: endpoint.y / cellPx + 0.5,
    col: endpoint.x / cellPx + 0.5,
    links: [],
    customKey: key,
    isCustom: true,
    isManualEndpoint: true
  };
  skeleton.cells.push(cell);
  skeleton.cellByKey.set(key, cell);
  return cell;
}

function applyManualRouteSegments(skeleton) {
  if (!skeleton?.cells?.length || !routeManualSegments.length) return skeleton;
  for (const segment of routeManualSegments) {
    const first = ensureManualRouteEndpoint(skeleton, segment.fromPoint || { key: segment.from });
    const second = ensureManualRouteEndpoint(skeleton, segment.toPoint || { key: segment.to });
    if (!first || !second || first.id === second.id) continue;
    if (first.links.some((link) => link.to === second.id)) continue;
    const a = centerlinePoint(first);
    const b = centerlinePoint(second);
    addBidirectionalCenterlineLink(first, second, Math.hypot(b.x-a.x,b.y-a.y)/cellPx, { manualRoute: true, manualSegmentKey: segment.key });
  }
  return skeleton;
}

function refreshSimpleRouteStatus(message = "") {
  const status = document.querySelector("#simpleRouteStatus");
  if (!status) return;

  // 지도 폭을 깨뜨리던 후보 경로 통계/안내 상태줄은 화면에서 완전히 숨긴다.
  // 조작 안내는 각 버튼의 title과 선택 색상으로 제공한다.
  status.hidden = true;
  status.style.display = "none";
  status.removeAttribute("title");
  status.textContent = "";
}

function showRouteEditPopup(message, title = "새 경로를 만들 수 없습니다") {
  const text = `${title}\n\n${message}`;
  window.setTimeout(() => alert(text), 0);
}

function routeDrawFailure(message) {
  refreshSimpleRouteStatus(message);
  showRouteEditPopup(message);
  return true;
}

function countRouteEdges() {
  return buildLogicalRouteSegments().length;
}

function toggleSelectedRouteClosed() {
  if (!selectedRouteSegment?.edgeKeys?.length) {
    refreshSimpleRouteStatus("지도에서 교차점과 교차점 사이의 경로를 먼저 선택하세요.");
    return;
  }
  const shouldOpen = isRouteSegmentClosed(selectedRouteSegment);
  for (const edgeKey of selectedRouteSegment.edgeKeys) {
    if (shouldOpen) routeClosedEdges.delete(edgeKey);
    else routeClosedEdges.add(edgeKey);
  }
  saveCenterlineOverrides();
  routeLine.setAttribute("points", "");
  renderCenterlineDebug();
  refreshSimpleRouteStatus(shouldOpen ? "선택한 경로를 다시 사용 가능으로 전환했습니다." : "선택한 경로를 폐쇄했습니다. 길찾기에서 제외됩니다.");
}

function deleteSelectedRouteSegment() {
  if (!selectedRouteSegment?.edgeKeys?.length) {
    refreshSimpleRouteStatus("삭제할 경로를 먼저 선택하세요.");
    return;
  }

  // 직접 추가한 단일 경로면 저장 목록에서도 제거한다.
  const selectedKeys = new Set(selectedRouteSegment.edgeKeys);
  routeManualSegments = routeManualSegments.filter((segment) => !selectedKeys.has(segment.key));

  // 자동 경로를 포함한 선택 경로 전체는 삭제 상태로 기록한다.
  for (const edgeKey of selectedRouteSegment.edgeKeys) {
    routeDeletedEdges.add(edgeKey);
    routeClosedEdges.delete(edgeKey);
  }

  selectedRouteEdgeKey = null;
  selectedRouteSegmentId = null;
  selectedRouteSegment = null;
  saveCenterlineOverrides();
  centerlineSkeleton = null;
  renderGridPreservingView();
  refreshSimpleRouteStatus("선택한 경로를 삭제했습니다. 자동 경로로 복원하면 다시 나타납니다.");
}

function handleSimpleRouteDrawClick(event) {
  if (!routeDrawMode || !gridMap) return false;
  event.preventDefault();
  event.stopPropagation();

  const point = clientToSvg(event.clientX, event.clientY);
  centerlineSkeleton ||= rebuildEditableCenterlineSkeleton();

  if (!routeDrawStartCell) {
    // 선의 정확한 중앙을 누르지 않아도 기존 경로 또는 꼭지점에 붙도록 넉넉하게 탐색한다.
    const anchor = nearestRouteGeometryAnchor(
      point,
      centerlineSkeleton,
      Math.max(cellPx * 4.6, 30)
    );
    const startCell = materializeRouteGeometryAnchor(anchor);
    if (!startCell) {
      const row = Math.floor(point.y / cellPx) + 1;
      const col = Math.floor(point.x / cellPx) + 1;
      if (!isWalkable(row, col)) {
        return routeDrawFailure("시작점이 복도 밖에 있습니다. 파란 경로 또는 원형 꼭지점을 선택하세요.");
      }
      return routeDrawFailure("선택 위치 가까이에 연결 가능한 파란 경로나 꼭지점이 없습니다. 지도를 확대해 경로 가까이를 다시 선택하세요.");
    }
    routeDrawStartCell = startCell;
    selectedCenterlineNodeKey = centerlineNodeKey(startCell);
    renderCenterlineDebug();
    refreshSimpleRouteStatus("시작점을 선택했습니다. 연결할 기존 경로나 복도 끝점을 선택하세요.");
    return true;
  }

  const startKey = centerlineNodeKey(routeDrawStartCell);
  const first = centerlineSkeleton?.cellByKey?.get(startKey) || routeDrawStartCell;
  const firstPoint = centerlinePoint(first);
  let endX = point.x;
  let endY = point.y;
  const horizontal = Math.abs(point.x - firstPoint.x) >= Math.abs(point.y - firstPoint.y);
  if (horizontal) endY = firstPoint.y;
  else endX = firstPoint.x;

  // 클릭한 방향의 기존 경로와 교차하면 해당 위치에 실제 접점을 만든다.
  const axisAnchor = findAxisRouteAnchor(
    firstPoint,
    { x: endX, y: endY },
    centerlineSkeleton,
    Math.max(cellPx * 4.2, 28)
  );
  let snappedEndCell = null;
  if (axisAnchor) {
    endX = axisAnchor.point.x;
    endY = axisAnchor.point.y;
    snappedEndCell = materializeRouteGeometryAnchor({
      ...axisAnchor,
      point: { x: endX, y: endY },
      distance: 0
    });
    if (!snappedEndCell) {
      return routeDrawFailure("기존 경로와의 접점을 생성하지 못했습니다. 경로 복원 후 다시 시도하거나 다른 지점을 선택하세요.");
    }
  }

  const currentFirst = centerlineSkeleton?.cellByKey?.get(startKey) || first;
  const endRow = Math.floor(endY / cellPx) + 1;
  const endCol = Math.floor(endX / cellPx) + 1;
  if (!snappedEndCell && !isWalkable(endRow, endCol)) {
    return routeDrawFailure("끝점이 복도 밖에 있습니다. 흰색 복도 안이나 기존 파란 경로 위를 선택하세요.");
  }

  const endpointProbe = snappedEndCell || {
    row: endY / cellPx + 0.5,
    col: endX / cellPx + 0.5,
    customKey: `PREVIEW:${endX}:${endY}`
  };
  const validation = validateRouteSegmentWalkability(currentFirst, endpointProbe);
  if (!validation.ok) return routeDrawFailure(validation.reason);

  const manualId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const endKey = snappedEndCell ? centerlineNodeKey(snappedEndCell) : `MANUAL:${manualId}`;
  if (startKey === endKey) {
    return routeDrawFailure("시작점과 같은 경로 지점을 선택했습니다. 더 떨어진 위치를 선택하세요.");
  }

  const key = [startKey, endKey].sort().join("|");
  if (routeManualSegments.some((segment) => segment.key === key)) {
    return routeDrawFailure("두 지점 사이의 경로가 이미 존재합니다.");
  }

  routeManualSegments.push({
    key,
    from: startKey,
    to: endKey,
    fromPoint: { key: startKey },
    toPoint: snappedEndCell
      ? { key: endKey }
      : { key: endKey, id: manualId, x: endX, y: endY }
  });

  routeClosedEdges.delete(key);
  routeDeletedEdges.delete(key);
  routeDrawStartCell = null;
  routeDrawMode = true;
  routeEditorTool = "draw";
  saveCenterlineOverrides();
  centerlineSkeleton = null;
  renderGridPreservingView();
  updateRouteEditorToolButtons();
  refreshSimpleRouteStatus("새 경로를 추가했습니다. 그리기 모드가 유지됩니다. 다음 시작점을 선택하세요.");
  return true;
}

function ensureAdminEditorMenuStyles() {
  if (document.querySelector("#adminEditorMenuStyles")) return;
  const style = document.createElement("style");
  style.id = "adminEditorMenuStyles";
  style.textContent = `
    .map-toolbar { align-items: flex-start; }
    .map-actions.admin-editor-menu {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 7px;
    }
    .admin-editor-main-row,
    .admin-editor-detail-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      width: 100%;
      min-width: 0;
    }
    .admin-editor-main-left,
    .admin-editor-main-right {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .admin-editor-main-right {
      margin-left: auto;
      padding-left: 12px;
      border-left: 1px solid #d9e0e7;
    }
    .admin-editor-detail-row {
      padding-top: 7px;
      border-top: 1px solid #d9e0e7;
    }
    .admin-editor-detail-left,
    .admin-editor-detail-right {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .admin-editor-detail-left { flex: 1 1 auto; }
    .admin-editor-detail-right {
      flex: 0 0 auto;
      margin-left: auto;
    }
    .admin-editor-detail-row[hidden] { display: none !important; }
    .admin-editor-main-row button,
    .admin-editor-detail-row button {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .admin-editor-main-row .editor-mode-button.active,
    .admin-editor-detail-row button.active {
      color: #fff;
      border-color: #1d4ed8;
      background: #1d4ed8;
    }
    .grid-booth-group.booth-label-selected .grid-booth {
      stroke: #f59e0b !important;
      stroke-width: 2.2 !important;
    }
    #floorMap.booth-label-edit-mode .grid-booth-group { cursor: pointer; }
    #floorMap.booth-label-edit-mode .grid-booth { pointer-events: all; }
    #floorMap.booth-label-move-mode .grid-booth-group.booth-label-selected { cursor: move; }
    .managed-location-marker { cursor: default; }
    #floorMap.location-edit-mode .managed-location-marker { cursor: move; }
    #floorMap.location-edit-mode #startMarker,
    #floorMap.location-edit-mode #destinationMarker,
    #floorMap.location-edit-mode #routeLine {
      display: none !important;
      visibility: hidden !important;
    }
    .managed-location-marker .location-pin-body {
      stroke: #fff;
      stroke-width: 1.2;
      paint-order: stroke;
    }
    .managed-location-marker.selected .location-pin-body {
      stroke: #fff;
      stroke-width: 1.4;
      filter: drop-shadow(0 0 2px rgba(245,158,11,.95));
    }
    .location-pin-label { font-weight: 700; paint-order: stroke; stroke: #fff; stroke-width: 2px; stroke-linejoin: round; }
    .admin-location-item.selected { border-color: #f59e0b; box-shadow: 0 0 0 2px rgba(245,158,11,.18); }

    .booth-editor-field {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 34px;
      min-height: 34px;
      padding: 0 7px;
      border: 1px solid #d9e0e7;
      border-radius: 8px;
      background: #fff;
      white-space: nowrap;
      font-size: 12px;
      line-height: 1;
      font-weight: 700;
      color: #334155;
      vertical-align: middle;
    }
    .booth-editor-field input,
    .booth-editor-field select {
      box-sizing: border-box;
      height: 26px;
      min-height: 26px;
      line-height: 20px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #fff;
      padding: 1px 6px;
      font-size: 12px;
      font-family: inherit;
      font-weight: 700;
      color: #0f172a;
      vertical-align: middle;
    }
    .booth-editor-field input { width: 56px; appearance: textfield; }
    .booth-editor-field input::-webkit-inner-spin-button,
    .booth-editor-field input::-webkit-outer-spin-button { margin: 0; }
    .booth-editor-field select { min-width: 118px; }
    #boothEditorDetails {
      align-items: flex-start;
      flex-wrap: nowrap;
    }
    .booth-editor-detail-left {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 7px;
      min-width: 0;
    }
    .booth-editor-primary-row,
    .booth-editor-secondary-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .booth-editor-primary-row > button,
    .booth-editor-primary-row > .booth-editor-field {
      box-sizing: border-box;
      height: 34px;
      min-height: 34px;
      margin: 0;
      align-self: center;
      vertical-align: middle;
    }
    .booth-editor-primary-row > button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .booth-editor-primary-row > .booth-editor-field {
      display: inline-flex;
      align-items: center;
      padding-top: 0;
      padding-bottom: 0;
    }
    .booth-editor-primary-row > .booth-editor-field > span,
    .booth-editor-primary-row > .booth-editor-field > label {
      display: inline-flex;
      align-items: center;
      height: 100%;
      margin: 0;
      line-height: 1;
    }
    .booth-editor-primary-row > .booth-editor-field input {
      height: 26px;
      min-height: 26px;
      margin: 0;
      line-height: 1;
    }
    .booth-editor-detail-right {
      align-self: flex-start;
      margin-left: auto;
      padding-left: 12px;
    }
    .booth-editor-detail-right > button {
      box-sizing: border-box;
      height: 34px;
      min-height: 34px;
      margin: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .booth-editor-field {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 34px;
      box-sizing: border-box;
    }
    .booth-editor-field input,
    .booth-editor-field select {
      height: 28px;
      min-height: 28px;
      margin: 0;
      box-sizing: border-box;
      font: inherit;
      line-height: 1;
    }
    #boothLiftMultiplierInput {
      width: 58px;
      padding: 3px 7px;
      font-size: 12px;
      font-weight: 700;
    }
    @media (max-width: 520px) {
      .map-toolbar { display: block; }
      .map-toolbar > strong { display: block; margin-bottom: 8px; }
      .admin-editor-main-row button,
      .admin-editor-detail-row button { font-size: 12px; padding: 5px 8px; }
      #boothEditorDetails { flex-wrap: wrap; }
      .booth-editor-detail-right { margin-left: auto; padding-left: 0; }
    }
  `;
  document.head.appendChild(style);
}


function updateRouteEditorToolButtons() {
  const buttonMap = {
    draw: document.querySelector("#routeCandidateDrawBtn"),
    close: document.querySelector("#routeCandidateCloseBtn"),
    delete: document.querySelector("#routeCandidateDeleteBtn")
  };

  for (const [tool, button] of Object.entries(buttonMap)) {
    if (!button) continue;
    button.classList.toggle("active", routeEditorTool === tool);
    button.setAttribute("aria-pressed", routeEditorTool === tool ? "true" : "false");
  }
}

function setRouteEditorTool(tool) {
  routeEditorTool = routeEditorTool === tool ? null : tool;
  routeDrawMode = routeEditorTool === "draw";
  routeDrawStartCell = null;
  updateRouteEditorToolButtons();
  renderCenterlineDebug();
}

function setAdminEditorMode(mode) {
  const routeButton = document.querySelector("#routeCandidateEditBtn");
  const boothButton = document.querySelector("#boothLabelEditBtn");
  const locationButton = document.querySelector("#locationEditBtn");
  const detailRow = document.querySelector("#adminEditorDetailRow");
  const routeDetails = document.querySelector("#routeEditorDetails");
  const boothDetails = document.querySelector("#boothEditorDetails");
  const locationDetails = document.querySelector("#locationEditorDetails");

  const routeActive = mode === "route";
  const boothActive = mode === "booth";
  const locationActive = mode === "location";

  // 다른 편집기로 넘어갈 때는 벡터 SVG 레이어만 먼저 정리한다.
  // 관리자 메뉴 모드는 아래에서 바로 booth/location으로 바뀌므로 중간에 닫히는 느낌이 없다.
  if (!routeActive && window.JointRouteEditor?.isOpen?.()) {
    window.JointRouteEditor.close({ preserveAdminMode: true });
  }

  centerlineEditMode = routeActive;
  boothLabelEditMode = boothActive;
  locationEditMode = locationActive;
  routeDrawMode = false;
  routeEditorTool = null;
  routeDrawStartCell = null;
  selectedRouteEdgeKey = null;
  selectedRouteSegmentId = null;
  selectedRouteSegment = null;
  boothLabelDrag = null;
  boothLabelMoveMode = false;
  boothSplitMode = false;
  managedLocationDrag = null;

  if (!boothActive) selectedBoothLabelId = null;
  if (!locationActive) selectedManagedLocationCode = null;
  if (!routeActive) selectedCenterlineNodeKey = null;

  routeButton?.classList.toggle("active", routeActive);
  boothButton?.classList.toggle("active", boothActive);
  locationButton?.classList.toggle("active", locationActive);
  updateRouteEditorToolButtons();
  floorMap.classList.toggle("centerline-edit-mode", routeActive);
  floorMap.classList.toggle("booth-label-edit-mode", boothActive);
  floorMap.classList.toggle("location-edit-mode", locationActive);

  if (locationActive) {
    startMarker.style.setProperty("display", "none", "important");
    destinationMarker.style.setProperty("display", "none", "important");
    routeLine.style.setProperty("display", "none", "important");
    routeLine.setAttribute("points", "");
  } else {
    // 지점 편집에서 다른 모드로 전환할 때 강제 숨김 상태를 해제한다.
    startMarker.style.removeProperty("display");
    destinationMarker.style.removeProperty("display");
    routeLine.style.removeProperty("display");
    startMarker.style.removeProperty("visibility");
    destinationMarker.style.removeProperty("visibility");
    routeLine.style.removeProperty("visibility");
  }

  if (detailRow) detailRow.hidden = !routeActive && !boothActive && !locationActive;
  if (routeDetails) routeDetails.hidden = !routeActive;
  if (boothDetails) boothDetails.hidden = !boothActive;
  if (locationDetails) locationDetails.hidden = !locationActive;

  renderGridPreservingView();

  // 경로 편집도 부스/지점 편집과 같은 관리자 모드 전환 흐름 안에서 연다.
  if (routeActive) {
    if (!window.JointRouteEditor?.open) {
      alert("벡터 경로 편집기를 불러오는 중입니다. 잠시 후 다시 눌러 주세요.");
      return;
    }
    window.JointRouteEditor.open({ preserveAdminMode: true });
  }
}

// 외부 벡터 편집 모듈도 동일한 관리자 모드 전환 함수를 사용한다.
window.setAdminEditorMode = setAdminEditorMode;

function ensureAdminEditorMenu() {
  if (!isAdminScreen()) return;
  const toolbar = document.querySelector(".map-actions");
  if (!toolbar) return;

  ensureAdminEditorMenuStyles();
  toolbar.classList.add("admin-editor-menu");
  toolbar.closest(".map-toolbar")?.classList.add("admin-editor-toolbar");

  let mainRow = document.querySelector("#adminEditorMainRow");
  let detailRow = document.querySelector("#adminEditorDetailRow");

  if (!mainRow) {
    mainRow = document.createElement("div");
    mainRow.id = "adminEditorMainRow";
    mainRow.className = "admin-editor-main-row";
  }
  if (!detailRow) {
    detailRow = document.createElement("div");
    detailRow.id = "adminEditorDetailRow";
    detailRow.className = "admin-editor-detail-row";
    detailRow.hidden = true;
  }

  let routeButton = document.querySelector("#routeCandidateEditBtn");
  if (!routeButton) {
    routeButton = document.createElement("button");
    routeButton.id = "routeCandidateEditBtn";
    routeButton.type = "button";
    routeButton.textContent = "경로 편집";
    routeButton.className = "editor-mode-button";
    routeButton.addEventListener("click", () => {
      setAdminEditorMode(centerlineEditMode ? null : "route");
    });
  }

  let boothButton = document.querySelector("#boothLabelEditBtn");
  if (!boothButton) {
    boothButton = document.createElement("button");
    boothButton.id = "boothLabelEditBtn";
    boothButton.type = "button";
    boothButton.textContent = "부스 편집";
    boothButton.className = "editor-mode-button";
    boothButton.title = "부스를 선택한 뒤 부스번호 위치와 크기를 수정합니다.";
    boothButton.addEventListener("click", () => {
      setAdminEditorMode(boothLabelEditMode ? null : "booth");
    });
  }

  let locationButton = document.querySelector("#locationEditBtn");
  if (!locationButton) {
    locationButton = document.createElement("button");
    locationButton.id = "locationEditBtn";
    locationButton.type = "button";
    locationButton.textContent = "지점 편집";
    locationButton.className = "editor-mode-button";
    locationButton.title = "QR 지점을 선택하거나 끌어서 위치를 수정합니다.";
    locationButton.addEventListener("click", () => {
      setAdminEditorMode(locationEditMode ? null : "location");
    });
  }

  let routeDetails = document.querySelector("#routeEditorDetails");
  if (!routeDetails) {
    routeDetails = document.createElement("div");
    routeDetails.id = "routeEditorDetails";
    routeDetails.className = "admin-editor-detail-row";
    routeDetails.hidden = true;

    const drawButton = document.createElement("button");
    drawButton.id = "routeCandidateDrawBtn";
    drawButton.type = "button";
    drawButton.textContent = "새 경로 그리기";
    drawButton.addEventListener("click", () => {
      centerlineEditMode = true;
      selectedRouteEdgeKey = null;
      selectedRouteSegmentId = null;
      selectedRouteSegment = null;
      setRouteEditorTool("draw");
      refreshSimpleRouteStatus(
        routeDrawMode
          ? "새 경로 그리기 모드가 켜졌습니다. 시작점과 끝점을 반복해서 선택할 수 있습니다."
          : "새 경로 그리기 모드를 종료했습니다."
      );
    });

    const closeButton = document.createElement("button");
    closeButton.id = "routeCandidateCloseBtn";
    closeButton.type = "button";
    closeButton.textContent = "경로 폐쇄/재개";
    closeButton.addEventListener("click", () => {
      routeEditorTool = "close";
      routeDrawMode = false;
      routeEditorTool = null;
      routeDrawStartCell = null;
      updateRouteEditorToolButtons();
      toggleSelectedRouteClosed();
    });

    const deleteButton = document.createElement("button");
    deleteButton.id = "routeCandidateDeleteBtn";
    deleteButton.type = "button";
    deleteButton.textContent = "경로 삭제";
    deleteButton.addEventListener("click", () => {
      routeEditorTool = "delete";
      routeDrawMode = false;
      routeDrawStartCell = null;
      updateRouteEditorToolButtons();
      deleteSelectedRouteSegment();
    });

    const resetButton = document.createElement("button");
    resetButton.id = "routeCandidateResetBtn";
    resetButton.type = "button";
    resetButton.textContent = "경로 복원";
    resetButton.addEventListener("click", () => {
      if (!confirm("경로를 자동 생성 상태로 복원하시겠습니까?\n\n폐쇄·삭제·직접 추가·교차점 이동·병합·우회 설정이 모두 초기화됩니다.")) return;

      centerlineOverrides = {};
      centerlineDeletedNodes = new Set();
      centerlineBypasses = {};
      centerlineMergedNodes = {};
      centerlineCustomNodes = {};
      routeClosedEdges = new Set();
      routeDeletedEdges = new Set();
      routeManualSegments = [];

      selectedCenterlineNodeKey = null;
      selectedRouteEdgeKey = null;
      selectedRouteSegmentId = null;
      selectedRouteSegment = null;
      centerlineDrag = null;
      routeSegmentDrag = null;
      routeDrawMode = false;
      routeDrawStartCell = null;

      for (const key of [
        CENTERLINE_OVERRIDE_KEY,
        CENTERLINE_DELETED_KEY,
        CENTERLINE_BYPASS_KEY,
        CENTERLINE_MERGE_KEY,
        CENTERLINE_CUSTOM_NODE_KEY,
        ROUTE_CLOSED_EDGE_KEY,
        ROUTE_DELETED_EDGE_KEY,
        ROUTE_MANUAL_SEGMENT_KEY
      ]) storage.removeItem(key);

      broadcastLocalStateChange("route-restore");
      centerlineSkeleton = null;
      renderGridPreservingView();
      refreshSimpleRouteStatus("자동 생성 경로로 복원했습니다.");
    });

    routeDetails.append(drawButton, closeButton, deleteButton, resetButton);
  }

  let boothDetails = document.querySelector("#boothEditorDetails");
  if (!boothDetails) {
    boothDetails = document.createElement("div");
    boothDetails.id = "boothEditorDetails";
    boothDetails.className = "admin-editor-detail-row";
    boothDetails.hidden = true;

    const selectButton = document.createElement("button");
    selectButton.id = "boothLabelMoveBtn";
    selectButton.type = "button";
    selectButton.textContent = "위치 조정";
    selectButton.title = "부스를 선택한 뒤 번호 또는 선택 부스 영역을 끌어 위치를 조정합니다.";
    selectButton.addEventListener("click", () => {
      if (!selectedBoothLabelId) {
        alert("먼저 지도에서 위치를 조정할 부스를 선택하세요.");
        return;
      }
      boothLabelMoveMode = !boothLabelMoveMode;
      selectButton.classList.toggle("active", boothLabelMoveMode);
      floorMap.classList.toggle("booth-label-move-mode", boothLabelMoveMode);
    });

    const largerButton = document.createElement("button");
    largerButton.type = "button";
    largerButton.textContent = "글자 +";
    largerButton.addEventListener("click", () => adjustSelectedBoothLabelFont(1));

    const smallerButton = document.createElement("button");
    smallerButton.type = "button";
    smallerButton.textContent = "글자 -";
    smallerButton.addEventListener("click", () => adjustSelectedBoothLabelFont(-1));

    const visibilityButton = document.createElement("button");
    visibilityButton.type = "button";
    visibilityButton.textContent = "번호 표시/숨김";
    visibilityButton.addEventListener("click", toggleSelectedBoothLabelVisibility);

    const splitButton = document.createElement("button");
    splitButton.type = "button";
    splitButton.textContent = "부스 분리";
    splitButton.title = "한 부스로 묶인 떨어진 영역 중 분리할 영역을 선택합니다.";
    splitButton.addEventListener("click", () => {
      if (!selectedBoothLabelId) {
        alert("먼저 지도에서 분리할 부스를 선택하세요.");
        return;
      }
      boothSplitMode = true;
      alert("분리할 부스 영역을 지도에서 클릭하세요. 새 부스번호를 입력하면 별도 부스로 분리됩니다.");
    });

    const liftField = document.createElement("label");
    liftField.className = "booth-editor-field";
    liftField.textContent = "전체 돌출 높이";
    const liftInput = document.createElement("input");
    liftInput.id = "boothLiftMultiplierInput";
    liftInput.type = "number";
    liftInput.min = "0";
    liftInput.max = "8";
    liftInput.step = "0.1";
    liftInput.value = "2.65";
    liftInput.disabled = false;
    liftInput.title = "모든 부스에 공통 적용되는 선택 돌출 높이 배수입니다. 기본값은 2.65입니다.";
    liftInput.addEventListener("change", () => setGlobalBoothLiftMultiplier(liftInput.value));
    liftField.appendChild(liftInput);

    const specialField = document.createElement("label");
    specialField.className = "booth-editor-field";
    specialField.textContent = "특별 표시";
    const specialSelect = document.createElement("select");
    specialSelect.id = "boothSpecialTypeSelect";
    specialSelect.disabled = true;
    for (const [value, label] of [
      ["none", "표시 없음"],
      ["premium", "프리미엄 · 다이아"],
      ["awards", "어워즈 · 왕관"],
      ["event", "이벤트 · 금색 스파클"]
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      specialSelect.appendChild(option);
    }
    specialSelect.addEventListener("change", () => setSelectedBoothSpecialType(specialSelect.value));
    specialField.appendChild(specialSelect);

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "부스 복원";
    resetButton.title = "자동 불러오기 이후의 부스번호 위치·크기·표시 상태와 부스 분리 작업을 모두 초기 상태로 되돌립니다.";
    resetButton.addEventListener("click", restoreAllBoothEditsToAutomatic);

    const boothLeftControls = document.createElement("div");
    boothLeftControls.className = "admin-editor-detail-left booth-editor-detail-left";

    const boothPrimaryRow = document.createElement("div");
    boothPrimaryRow.className = "booth-editor-primary-row";
    boothPrimaryRow.append(
      selectButton, largerButton, smallerButton, visibilityButton, splitButton, liftField
    );

    const boothSecondaryRow = document.createElement("div");
    boothSecondaryRow.className = "booth-editor-secondary-row";
    boothSecondaryRow.appendChild(specialField);

    boothLeftControls.append(boothPrimaryRow, boothSecondaryRow);

    const boothRightControls = document.createElement("div");
    boothRightControls.className = "admin-editor-detail-right booth-editor-detail-right";
    boothRightControls.appendChild(resetButton);

    boothDetails.append(boothLeftControls, boothRightControls);
    updateBoothEditorInputs();
  }

  let locationDetails = document.querySelector("#locationEditorDetails");
  if (!locationDetails) {
    locationDetails = document.createElement("div");
    locationDetails.id = "locationEditorDetails";
    locationDetails.className = "admin-editor-detail-row";
    locationDetails.hidden = true;

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = "새 지점 등록";
    addButton.addEventListener("click", () => {
      beginAutomaticQrLocationPick();
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "선택 지점 삭제";
    deleteButton.addEventListener("click", () => {
      if (!selectedManagedLocationCode) {
        alert("지도에서 삭제할 지점을 먼저 선택하세요.");
        return;
      }
      const items = loadManagedLocations();
      const selected = items.find((item) => item.code === selectedManagedLocationCode);
      if (!selected || !confirm(`${selected.name} 지점을 삭제하시겠습니까?`)) return;
      saveManagedLocations(items.filter((item) => item.code !== selectedManagedLocationCode));
      selectedManagedLocationCode = null;
      renderAdminLocations();
      populateStarts();
      renderManagedLocationMarkers();
      broadcastLocalStateChange("location-delete");
    });

    locationDetails.append(addButton, deleteButton);
  }

  document.querySelector("#simpleRouteStatus")?.remove();

  const connectivity = document.querySelector("#centerlineConnectivityStatus");
  const zoomOut = document.querySelector("#zoomOutBtn");
  const fit = document.querySelector("#fitBtn");
  const zoomIn = document.querySelector("#zoomInBtn");

  let mainLeft = document.querySelector("#adminEditorMainLeft");
  let mainRight = document.querySelector("#adminEditorMainRight");
  if (!mainLeft) {
    mainLeft = document.createElement("div");
    mainLeft.id = "adminEditorMainLeft";
    mainLeft.className = "admin-editor-main-left";
  }
  if (!mainRight) {
    mainRight = document.createElement("div");
    mainRight.id = "adminEditorMainRight";
    mainRight.className = "admin-editor-main-right";
  }

  mainLeft.replaceChildren(routeButton, boothButton, locationButton);
  mainRight.replaceChildren();
  if (connectivity) mainRight.append(connectivity);
  if (zoomOut) mainRight.append(zoomOut);
  if (fit) mainRight.append(fit);
  if (zoomIn) mainRight.append(zoomIn);
  mainRow.replaceChildren(mainLeft, mainRight);

  detailRow.replaceChildren(routeDetails, boothDetails, locationDetails);
  toolbar.replaceChildren(mainRow, detailRow);

  routeDetails.hidden = !centerlineEditMode;
  boothDetails.hidden = !boothLabelEditMode;
  locationDetails.hidden = !locationEditMode;
  detailRow.hidden = !centerlineEditMode && !boothLabelEditMode && !locationEditMode;
  routeButton.classList.toggle("active", centerlineEditMode);
  boothButton.classList.toggle("active", boothLabelEditMode);
  locationButton.classList.toggle("active", locationEditMode);
  updateRouteEditorToolButtons();
}

function ensureCenterlineEditorControls() {
  ensureAdminEditorMenu();
}

function beginCenterlineDrag(event, cell) {
  if (!centerlineEditMode) return;

  event.preventDefault();
  event.stopPropagation();

  selectedCenterlineNodeKey = centerlineNodeKey(cell);

  const point = clientToSvg(
    event.clientX,
    event.clientY
  );

  const neighbors = cell.links
    .map((link) => centerlineSkeleton?.cells?.[link.to])
    .filter(
      (target) =>
        target &&
        !isCenterlineNodeDeleted(target)
    );

  const draggedKey = centerlineNodeKey(cell);
  const incidentSegments = buildLogicalRouteSegments(centerlineSkeleton)
    .filter((segment) => {
      const fromKey = centerlineNodeKey(segment.from);
      const toKey = centerlineNodeKey(segment.to);
      return fromKey === draggedKey || toKey === draggedKey;
    })
    .map((segment) => {
      const fromKey = centerlineNodeKey(segment.from);
      const draggedAtStart = fromKey === draggedKey;
      const orderedCells = draggedAtStart ? [...segment.cells] : [...segment.cells].reverse();
      return {
        opposite: orderedCells[orderedCells.length - 1],
        innerCells: orderedCells.slice(1, -1)
      };
    });

  centerlineDrag = {
    pointerId: event.pointerId,
    cell,
    neighbors,
    incidentSegments,
    startPointer: point,
    startPoint: centerlinePoint(cell),
    moved: false
  };

  floorMap.setPointerCapture(event.pointerId);
  renderCenterlineDebug();
}

function moveCenterlineDrag(event) {
  if (
    !centerlineDrag ||
    event.pointerId !== centerlineDrag.pointerId
  ) {
    return false;
  }

  const point = clientToSvg(
    event.clientX,
    event.clientY
  );

  if (Math.hypot(
    point.x - centerlineDrag.startPointer.x,
    point.y - centerlineDrag.startPointer.y
  ) > Math.max(1.5, cellPx * 0.12)) {
    centerlineDrag.moved = true;
  }

  let x =
    centerlineDrag.startPoint.x +
    point.x -
    centerlineDrag.startPointer.x;

  let y =
    centerlineDrag.startPoint.y +
    point.y -
    centerlineDrag.startPointer.y;

  const fineMove = event.altKey || event.ctrlKey;

  if (!fineMove) {
    const neighborPoints =
      centerlineDrag.neighbors.map(centerlinePoint);

    const magnetDistance = cellPx * 0.78;
    let bestX = null;
    let bestY = null;
    let bestXDistance = Infinity;
    let bestYDistance = Infinity;

    for (const neighbor of neighborPoints) {
      const dx = Math.abs(x - neighbor.x);
      const dy = Math.abs(y - neighbor.y);

      if (dx < bestXDistance) {
        bestXDistance = dx;
        bestX = neighbor.x;
      }

      if (dy < bestYDistance) {
        bestYDistance = dy;
        bestY = neighbor.y;
      }
    }

    // 두 축을 동시에 끌어당기면 선 전체가 갑자기 늘어나므로, 더 가까운 한 축만 자석 정렬한다.
    if (bestXDistance <= magnetDistance || bestYDistance <= magnetDistance) {
      if (bestXDistance <= bestYDistance && bestXDistance <= magnetDistance) x = bestX;
      else if (bestYDistance <= magnetDistance) y = bestY;
    }

    /*
     * 양쪽 이웃이 이미 같은 수직선/수평선에 있으면
     * 선택점을 그 경로 위에 강하게 고정한다.
     */
    if (neighborPoints.length === 2) {
      if (
        Math.abs(neighborPoints[0].x - neighborPoints[1].x) < 0.01 &&
        Math.abs(x - neighborPoints[0].x) <= magnetDistance
      ) {
        x = neighborPoints[0].x;
      } else if (
        Math.abs(neighborPoints[0].y - neighborPoints[1].y) < 0.01 &&
        Math.abs(y - neighborPoints[0].y) <= magnetDistance
      ) {
        y = neighborPoints[0].y;
      }
    }
  } else {
    /*
     * Ctrl 또는 Alt를 누르면 자석 기능을 해제하고
     * 0.1셀 단위로 세밀하게 이동한다.
     */
    const fineStep = cellPx * 0.1;
    x = Math.round(x / fineStep) * fineStep;
    y = Math.round(y / fineStep) * fineStep;
  }

  const col = Math.floor(x / cellPx) + 1;
  const row = Math.floor(y / cellPx) + 1;

  if (!isWalkable(row, col)) return true;

  centerlineOverrides[
    centerlineNodeKey(centerlineDrag.cell)
  ] = {
    x,
    y,
    // 사용자가 직접 끌어 옮긴 점은 실제 편집 꼭지점으로 유지한다.
    explicitCorner: true
  };

  /*
   * 표시 벡터의 끝점을 옮길 때 기존 셀 경로가 예전 좌표를 따라 남아 있으면
   * 단순화 과정에서 그 위치가 새 꼭지점으로 다시 나타난다.
   * 드래그한 꼭지점에 연결된 각 벡터 구간의 내부 셀을 새 끝점과 반대편 끝점
   * 사이에 직선으로 재배치해, 연결선이 하나의 직선으로 따라오게 한다.
   */
  for (const incident of centerlineDrag.incidentSegments || []) {
    const oppositePoint = centerlinePoint(incident.opposite);
    const innerCells = incident.innerCells || [];
    const count = innerCells.length + 1;
    innerCells.forEach((innerCell, index) => {
      const t = (index + 1) / count;
      centerlineOverrides[centerlineNodeKey(innerCell)] = {
        x: x + (oppositePoint.x - x) * t,
        y: y + (oppositePoint.y - y) * t,
        explicitCorner: false
      };
    });
  }

  renderCenterlineDebug();
  return true;
}

function endCenterlineDrag(event) {
  if (
    !centerlineDrag ||
    event.pointerId !== centerlineDrag.pointerId
  ) {
    return false;
  }

  const moved = centerlineDrag.moved === true;
  const sourceKey = centerlineNodeKey(centerlineDrag.cell);

  let mergeTarget = null;
  if (moved) {
    saveCenterlineOverrides();
    selectedCenterlineNodeKey = sourceKey;
    mergeTarget = findCenterlineMergeTarget(centerlineDrag.cell);
    // 드래그 직후 브라우저가 발생시키는 click이 새 경로 점 선택으로
    // 처리되지 않도록 잠시 차단한다.
    suppressRouteVertexClickUntil = Date.now() + 350;
  }

  const draggedCell = centerlineDrag.cell;
  centerlineDrag = null;

  if (moved && mergeTarget) {
    mergeCenterlineNodes(draggedCell, mergeTarget);
    refreshSimpleRouteStatus(
      routeDrawMode
        ? "꼭지점을 합쳤습니다. 새 경로 그리기 모드는 계속 활성화되어 있습니다."
        : "꼭지점을 합쳤습니다. 연결된 선분은 병합점으로 이어집니다."
    );
    return true;
  }

  renderCenterlineDebug();

  if (moved) {
    refreshSimpleRouteStatus(
      routeDrawMode
        ? "꼭지점을 이동했습니다. 새 경로 그리기 모드는 계속 활성화되어 있습니다."
        : "꼭지점을 이동했습니다. 연결된 경로가 새 위치를 따라 이동합니다."
    );
  }

  return true;
}


function beginRouteSegmentPointer(event, segment) {
  if (!centerlineEditMode || routeDrawMode || !segment?.cells?.length) return;
  event.preventDefault();
  event.stopPropagation();

  selectedRouteSegmentId = segment.id;
  selectedRouteSegment = segment;
  selectedRouteEdgeKey = segment.edgeKeys.length === 1 ? segment.edgeKeys[0] : null;
  pendingRouteSegmentPointer = {
    pointerId: event.pointerId,
    segment,
    clientX: event.clientX,
    clientY: event.clientY
  };
  floorMap.setPointerCapture(event.pointerId);
}

function movePendingRouteSegmentPointer(event) {
  const pending = pendingRouteSegmentPointer;
  if (!pending || event.pointerId !== pending.pointerId) return false;
  const distance = Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY);
  if (distance < 6) return true;

  pendingRouteSegmentPointer = null;
  beginRouteSegmentDrag({
    pointerId: event.pointerId,
    clientX: pending.clientX,
    clientY: pending.clientY,
    preventDefault() {},
    stopPropagation() {}
  }, pending.segment);
  return moveRouteSegmentDrag(event) || true;
}

function endPendingRouteSegmentPointer(event) {
  const pending = pendingRouteSegmentPointer;
  if (!pending || event.pointerId !== pending.pointerId) return false;
  pendingRouteSegmentPointer = null;
  selectedRouteSegmentId = pending.segment.id;
  selectedRouteSegment = pending.segment;
  selectedRouteEdgeKey = pending.segment.edgeKeys.length === 1 ? pending.segment.edgeKeys[0] : null;
  selectedCenterlineNodeKey = null;
  renderCenterlineDebug();
  refreshSimpleRouteStatus(
    isRouteSegmentClosed(pending.segment)
      ? "폐쇄된 경로를 선택했습니다. 폐쇄/재개 버튼으로 복구할 수 있습니다."
      : "경로를 선택했습니다. 선을 끌면 이동하고, 끝점·교차점은 원형 점을 끌어 이동할 수 있습니다."
  );
  return true;
}

function beginRouteSegmentDrag(event, segment) {
  if (!centerlineEditMode || routeDrawMode || !segment?.cells?.length) return;
  event.preventDefault();
  event.stopPropagation();

  selectedRouteSegmentId = segment.id;
  selectedRouteSegment = segment;
  selectedRouteEdgeKey = segment.edgeKeys.length === 1 ? segment.edgeKeys[0] : null;

  const startPointer = clientToSvg(event.clientX, event.clientY);
  const firstPoint = centerlinePoint(segment.from);
  const lastPoint = centerlinePoint(segment.to);
  const horizontal = Math.abs(lastPoint.x - firstPoint.x) >= Math.abs(lastPoint.y - firstPoint.y);

  routeSegmentDrag = {
    pointerId: event.pointerId,
    segment,
    startPointer,
    horizontal,
    firstPoint,
    lastPoint,
    original: segment.cells.map((cell) => ({
      cell,
      key: centerlineNodeKey(cell),
      point: centerlinePoint(cell)
    }))
  };

  floorMap.setPointerCapture(event.pointerId);
}

function moveRouteSegmentDrag(event) {
  if (!routeSegmentDrag || event.pointerId !== routeSegmentDrag.pointerId) return false;

  const pointer = clientToSvg(event.clientX, event.clientY);
  const drag = routeSegmentDrag;
  const delta = drag.horizontal
    ? pointer.y - drag.startPointer.y
    : pointer.x - drag.startPointer.x;

  const endpointAxisAverage = drag.horizontal
    ? (drag.firstPoint.y + drag.lastPoint.y) / 2
    : (drag.firstPoint.x + drag.lastPoint.x) / 2;

  let targetAxis = drag.horizontal
    ? drag.original[Math.floor(drag.original.length / 2)].point.y + delta
    : drag.original[Math.floor(drag.original.length / 2)].point.x + delta;

  if (Math.abs(targetAxis - endpointAxisAverage) <= cellPx * 0.65) {
    targetAxis = endpointAxisAverage;
  } else {
    targetAxis = Math.round(targetAxis / cellPx) * cellPx;
  }

  // 양 끝점은 연결망을 유지하고, 그 사이의 점만 한 축으로 정렬한다.
  const inner = drag.original.slice(1, -1);
  for (const item of inner) {
    let x = item.point.x;
    let y = item.point.y;
    if (drag.horizontal) y = targetAxis;
    else x = targetAxis;

    const row = Math.floor(y / cellPx) + 1;
    const col = Math.floor(x / cellPx) + 1;
    if (!isWalkable(row, col)) continue;

    centerlineOverrides[item.key] = {
      x, y, explicitCorner: false
    };
  }

  renderCenterlineDebug();
  return true;
}

function endRouteSegmentDrag(event) {
  if (!routeSegmentDrag || event.pointerId !== routeSegmentDrag.pointerId) return false;
  saveCenterlineOverrides();
  routeSegmentDrag = null;
  renderCenterlineDebug();
  refreshSimpleRouteStatus("경로를 이동했습니다. 끝점 축 가까이 끌면 한 줄로 자동 정렬됩니다.");
  return true;
}

function renderCenterlineDebug() {
  centerlineDebugLayer?.remove();
  centerlineDebugLayer = null;

  /*
   * 중앙선은 관리자 화면에서만 편집용으로 표시한다.
   * 사용자 화면에는 파란 중앙선과 중앙선 버튼을 노출하지 않는다.
   */
  if (!gridMap || !isAdminScreen()) return;

  centerlineDebugLayer = svgEl("g", {
    id: "centerlineDebugLayer"
  });

  centerlineSkeleton = rebuildEditableCenterlineSkeleton();

  const cells = centerlineSkeleton?.cells || [];
  updateCenterlineConnectivityStatus(centerlineSkeleton);
  const logicalSegments = buildLogicalRouteSegments(centerlineSkeleton);

  // 화면에 실제로 그려지는 경로 구간의 양 끝점을 기준으로 편집 꼭지점을 만든다.
  // 그래프 노드의 차수만으로 판단하면 삭제된 선이나 병합 상태 때문에
  // 실제 선의 끝점이 누락되거나 내부 굴곡점이 꼭지점으로 표시될 수 있다.
  const visibleRouteVertexCells = new Map();
  const rememberVisibleRouteVertex = (cell) => {
    if (!cell) return;
    const point = centerlinePoint(cell);
    const positionKey = `${Math.round(point.x * 10) / 10}:${Math.round(point.y * 10) / 10}`;
    const existing = visibleRouteVertexCells.get(positionKey);
    if (!existing || cell.isCustom || cell.isManualEndpoint) {
      visibleRouteVertexCells.set(positionKey, cell);
    }
  };

  for (const segment of logicalSegments) {
    if (selectedRouteSegmentId === segment.id) selectedRouteSegment = segment;
    const deletedSegment = segment.edgeKeys.length > 0 && segment.edgeKeys.every((key) => routeDeletedEdges.has(key));
    if (deletedSegment) continue;
    const closedSegment = isRouteSegmentClosed(segment);
    const selectedSegment = selectedRouteSegmentId === segment.id;
    const disconnectedSegment = segment.cells.some((cell) => centerlineDisconnectedNodeIds.has(cell.id));
    const pointText = segment.points.map((point) => `${point.x},${point.y}`).join(" ");

    // 직선인지 꺾였는지와 무관하게, 표시되는 한 구간의 양 끝만 꼭지점이다.
    // 중간의 자동 골격 노드는 꼭지점으로 등록하지 않는다.
    rememberVisibleRouteVertex(segment.from);
    rememberVisibleRouteVertex(segment.to);

    if (disconnectedSegment) {
      const issueHalo = svgEl("polyline", {
        points: pointText,
        fill: "none",
        stroke: "#ffffff",
        "stroke-width": Math.max(7, cellPx * 0.9),
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: "0.98",
        "pointer-events": "none"
      });
      centerlineDebugLayer.appendChild(issueHalo);
    }

    const visibleLine = svgEl("polyline", {
      points: pointText,
      fill: "none",
      stroke: closedSegment ? "#dc2626" : selectedSegment ? "#f59e0b" : disconnectedSegment ? "#d946ef" : "#2563eb",
      "stroke-width": Math.max(disconnectedSegment ? 4.8 : 1.35, cellPx * (disconnectedSegment ? 0.62 : selectedSegment ? 0.34 : 0.25)),
      "stroke-dasharray": closedSegment ? `${Math.max(3, cellPx * 0.7)} ${Math.max(2, cellPx * 0.4)}` : disconnectedSegment ? `${Math.max(5, cellPx * 1.05)} ${Math.max(3, cellPx * 0.55)}` : "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      opacity: disconnectedSegment ? "1" : "0.9",
      "pointer-events": "none"
    });
    centerlineDebugLayer.appendChild(visibleLine);

    if (centerlineEditMode) {
      const hitLine = svgEl("polyline", {
        points: pointText,
        fill: "none",
        stroke: "transparent",
        "stroke-width": Math.max(20, cellPx * 2.4),
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "pointer-events": "stroke",
        cursor: "pointer"
      });
      hitLine.addEventListener("pointerdown", (event) => {
        if (routeDrawMode) {
          handleSimpleRouteDrawClick(event);
          return;
        }
        beginRouteSegmentPointer(event, segment);
      });
      centerlineDebugLayer.appendChild(hitLine);
    }
  }

  // 연결 이상 노드는 경로 편집 모드가 아니어도 항상 크게 표시한다.
  for (const component of centerlineDisconnectedComponents) {
    const logical = component.filter((cell) => {
      const activeLinks = cell.links.filter((link) => {
        const other = cells[link.to];
        return other && !routeDeletedEdges.has(routeEdgeKey(cell, other));
      });
      return activeLinks.length <= 1 || isLogicalRouteVertex({ ...cell, links: activeLinks }, cells);
    });
    const markers = logical.length ? logical : [component[0], component[component.length - 1]].filter(Boolean);
    for (const cell of markers) {
      const point = centerlinePoint(cell);
      const pulse = svgEl("circle", {
        cx: point.x,
        cy: point.y,
        r: Math.max(7, cellPx * 0.88),
        fill: "rgba(249,115,22,.28)",
        stroke: "#ffffff",
        "stroke-width": Math.max(2.2, cellPx * 0.28),
        class: "route-issue-pulse"
      });
      const core = svgEl("circle", {
        cx: point.x,
        cy: point.y,
        r: Math.max(4.4, cellPx * 0.56),
        fill: "#f97316",
        stroke: "#7c2d12",
        "stroke-width": Math.max(1.3, cellPx * 0.16),
        "pointer-events": "none"
      });
      centerlineDebugLayer.append(pulse, core);
    }
  }

  // 꼭지점은 화면에 실제로 표시된 경로 구간의 양 끝에만 표시한다.
  // 따라서 선의 실제 끝점은 항상 보이고, 한 구간 내부의 자동 굴곡점은 숨겨진다.
  if (centerlineEditMode) {
    for (const cell of visibleRouteVertexCells.values()) {
      if (isCenterlineNodeDeleted(cell) || isCenterlineNodeMerged(cell)) continue;
      const point = centerlinePoint(cell);
      const key = centerlineNodeKey(cell);
      const selected = key === selectedCenterlineNodeKey;
      const disconnectedNode = centerlineDisconnectedNodeIds.has(cell.id);
      const handle = svgEl("circle", {
        cx: point.x, cy: point.y,
        r: selected ? Math.max(4.2, cellPx * 0.52) : Math.max(3.4, cellPx * 0.43),
        fill: selected ? "#fef08a" : "#ffffff",
        stroke: disconnectedNode ? "#f97316" : "#1d4ed8",
        "stroke-width": Math.max(1.2, cellPx * 0.16),
        cursor: "move",
        "data-route-vertex": key,
        "data-centerline-handle": "true"
      });
      const handleHit = svgEl("circle", {
        cx: point.x, cy: point.y,
        r: Math.max(10, cellPx * 1.25),
        fill: "transparent",
        stroke: "none",
        "pointer-events": "all",
        cursor: routeDrawMode ? "crosshair" : "move",
        "data-centerline-handle": "true"
      });
      handleHit.addEventListener("pointerdown", (event) => {
        // 새 경로 그리기 모드에서도 드래그는 꼭지점 이동으로 처리한다.
        beginCenterlineDrag(event, cell);
      });
      handleHit.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (routeDrawMode) {
          if (Date.now() >= suppressRouteVertexClickUntil) {
            handleSimpleRouteDrawClick(event);
          }
          return;
        }
        selectedCenterlineNodeKey = key;
        renderCenterlineDebug();
      });
      centerlineDebugLayer.appendChild(handleHit);

      handle.addEventListener("pointerdown", (event) => {
        beginCenterlineDrag(event, cell);
      });
      handle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (routeDrawMode) {
          if (Date.now() >= suppressRouteVertexClickUntil) {
            handleSimpleRouteDrawClick(event);
          }
          return;
        }
        selectedCenterlineNodeKey = key;
        renderCenterlineDebug();
      });
      centerlineDebugLayer.appendChild(handle);
    }
  }

centerlineDebugLayer.style.display =
    (centerlineEditMode || locationEditMode) ? "block" : "none";

  floorMap.insertBefore(
    centerlineDebugLayer,
    routeLine
  );
}

function ensureCenterlineDebugToggle() {
  const oldButton =
    document.querySelector("#centerlineDebugBtn");
  oldButton?.remove();
}
