/* FINDER modular section: booths. Load order is defined in admin.html and index.html. */
let ignoreSyntheticBoothClickUntil = 0;
function updateBoothLabelSelection(id) {
  selectedBoothLabelId = id || null;
  if (gridMap) renderGridPreservingView();
}

function adjustSelectedBoothLabelFont(delta) {
  if (!selectedBoothLabelId) {
    alert("지도에서 수정할 부스를 먼저 선택하세요.");
    return;
  }

  const text = document.querySelector(
    `[data-booth-label-id="${CSS.escape(selectedBoothLabelId)}"]`
  );
  const current = Number(
    boothLabelOverrideFor(selectedBoothLabelId).fontSize ||
    text?.getAttribute("font-size") ||
    6
  );

  boothLabelOverrides[selectedBoothLabelId] = {
    ...boothLabelOverrideFor(selectedBoothLabelId),
    fontSize: Math.max(3, Math.min(24, current + delta)),
    visible: true
  };
  saveBoothLabelOverrides();
  renderGridPreservingView();
}

function toggleSelectedBoothLabelVisibility() {
  if (!selectedBoothLabelId) {
    alert("지도에서 수정할 부스를 먼저 선택하세요.");
    return;
  }

  const current = boothLabelOverrideFor(selectedBoothLabelId);
  boothLabelOverrides[selectedBoothLabelId] = {
    ...current,
    visible: current.visible === false
  };
  saveBoothLabelOverrides();
  renderGridPreservingView();
}


function selectedBoothOverrideId() {
  return selectedBoothLabelId || selectedDestination?.id || null;
}

function boothLiftStorageKey() {
  return config.STORAGE_KEYS.BOOTH_LIFT_MULTIPLIER || "exhibitionBoothLiftMultiplier";
}

function globalBoothLiftMultiplier() {
  const value = Number(storage.getItem(boothLiftStorageKey()));
  return Number.isFinite(value) ? Math.max(0, Math.min(8, value)) : 2.65;
}

function setGlobalBoothLiftMultiplier(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  storage.setItem(boothLiftStorageKey(), String(Math.max(0, Math.min(8, parsed))));
  renderGridPreservingView();
  updateBoothEditorInputs();
  broadcastLocalStateChange("booth-lift");
}

function setSelectedBoothSpecialType(value) {
  const id = selectedBoothOverrideId();
  if (!id) {
    alert("먼저 지도에서 부스를 선택하세요.");
    return;
  }
  const allowed = new Set(["none", "premium", "awards", "event"]);
  boothLabelOverrides[id] = {
    ...boothLabelOverrideFor(id),
    specialType: allowed.has(value) ? value : "none"
  };
  saveBoothLabelOverrides();
  renderGridPreservingView();
  updateBoothEditorInputs();
}

function updateBoothEditorInputs() {
  const id = selectedBoothOverrideId();
  const liftInput = document.querySelector("#boothLiftMultiplierInput");
  const specialSelect = document.querySelector("#boothSpecialTypeSelect");
  if (liftInput) {
    liftInput.disabled = false;
    liftInput.value = String(globalBoothLiftMultiplier());
  }
  if (specialSelect) {
    specialSelect.disabled = !id;
    specialSelect.value = id ? (boothLabelOverrideFor(id).specialType || "none") : "none";
  }
}

function restoreAllBoothEditsToAutomatic() {
  const originalText = storage.getItem(config.STORAGE_KEYS.GRID_MAP_ORIGINAL);

  if (!originalText) {
    alert("복원할 자동 불러오기 원본이 없습니다. 부스배치도 엑셀을 다시 등록해 주세요.");
    return;
  }

  if (!confirm(
    "부스를 자동 불러오기 상태로 복원하시겠습니까?\n\n" +
    "부스번호 위치 조정, 글자 크기, 표시·숨김, 전체 돌출 높이, 특별 표시, 부스 분리 작업이 모두 초기화됩니다."
  )) {
    return;
  }


  let original;
  try {
    original = JSON.parse(originalText);
  } catch {
    alert("자동 불러오기 원본을 읽지 못했습니다. 부스배치도 엑셀을 다시 등록해 주세요.");
    return;
  }

  /*
   * 부스 형상과 번호 구성은 엑셀 자동 분석 원본으로 되돌리되,
   * 참가기업 엑셀에서 반영한 기업명·품목 등의 정보는 같은 부스번호에 유지한다.
   */
  const currentById = new Map(
    (gridMap?.destinations || []).map((item) => [item.id, item])
  );

  const metadataKeys = [
    "name", "nameEn", "category", "products", "keywords",
    "website", "note", "type", "booth"
  ];

  original.destinations = (original.destinations || []).map((originalItem) => {
    const current = currentById.get(originalItem.id);
    if (!current) return originalItem;

    const merged = { ...originalItem };
    for (const key of metadataKeys) {
      if (current[key] !== undefined) merged[key] = current[key];
    }
    return merged;
  });

  gridMap = original;
  boothLabelOverrides = {};
  selectedBoothLabelId = null;
  boothLabelMoveMode = false;
  boothSplitMode = false;
  boothLabelDrag = null;

  storage.setItem(config.STORAGE_KEYS.GRID_MAP, JSON.stringify(gridMap));
  storage.removeItem(BOOTH_LABEL_OVERRIDE_KEY);
  storage.removeItem(boothLiftStorageKey());
  storage.removeItem("exhibitionBoothCorrections");

  document.querySelector("#boothLabelMoveBtn")?.classList.remove("active");
  floorMap.classList.remove("booth-label-move-mode");

  clearanceMap = null;
  centerlineSkeleton = null;
  renderGridPreservingView();
  broadcastLocalStateChange("booth-restore");
}

function beginBoothLabelDrag(event, item, x, y) {
  if (!boothLabelEditMode || !boothLabelMoveMode || !isAdminScreen()) return;
  event.preventDefault();
  event.stopPropagation();

  selectedBoothLabelId = item.id;
  const point = clientToSvg(event.clientX, event.clientY);
  boothLabelDrag = {
    pointerId: event.pointerId,
    id: item.id,
    startPointer: point,
    startX: x,
    startY: y,
    element: event.currentTarget
  };
  floorMap.setPointerCapture(event.pointerId);
}

function moveBoothLabelDrag(event) {
  if (!boothLabelDrag || event.pointerId !== boothLabelDrag.pointerId) {
    return false;
  }

  const point = clientToSvg(event.clientX, event.clientY);
  const x = boothLabelDrag.startX + point.x - boothLabelDrag.startPointer.x;
  const y = boothLabelDrag.startY + point.y - boothLabelDrag.startPointer.y;
  const current = boothLabelOverrideFor(boothLabelDrag.id);

  boothLabelOverrides[boothLabelDrag.id] = {
    ...current,
    x,
    y,
    visible: true
  };

  boothLabelDrag.element?.setAttribute("x", x);
  boothLabelDrag.element?.setAttribute("y", y);
  return true;
}

function endBoothLabelDrag(event) {
  if (!boothLabelDrag || event.pointerId !== boothLabelDrag.pointerId) {
    return false;
  }
  boothLabelDrag = null;
  saveBoothLabelOverrides();
  renderGridPreservingView();
  return true;
}

function ensureBoothLabelEditorControls() {
  ensureAdminEditorMenu();
}

function boothCellsFromShapes(item) {
  const cells = new Set();
  for (const shape of item?.shapes || []) {
    for (let row = shape.r1; row <= shape.r2; row++) {
      for (let col = shape.c1; col <= shape.c2; col++) {
        cells.add(`${row},${col}`);
      }
    }
  }
  return cells;
}

function connectedBoothComponents(item) {
  const cells = boothCellsFromShapes(item);
  const remaining = new Set(cells);
  const components = [];
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

  while (remaining.size) {
    const first = remaining.values().next().value;
    const queue = [first];
    const component = new Set([first]);
    remaining.delete(first);

    while (queue.length) {
      const key = queue.pop();
      const [row, col] = key.split(",").map(Number);
      for (const [dr, dc] of dirs) {
        const next = `${row + dr},${col + dc}`;
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        component.add(next);
        queue.push(next);
      }
    }
    components.push(component);
  }
  return components;
}

function cellsToBoothShapes(cells, color) {
  const byRow = new Map();
  for (const key of cells) {
    const [row, col] = key.split(",").map(Number);
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(col);
  }

  const shapes = [];
  for (const [row, cols] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    cols.sort((a, b) => a - b);
    let start = cols[0];
    let previous = cols[0];
    for (let index = 1; index <= cols.length; index++) {
      const current = cols[index];
      if (current === previous + 1) {
        previous = current;
        continue;
      }
      shapes.push({ r1: row, r2: row, c1: start, c2: previous, color });
      start = current;
      previous = current;
    }
  }
  return shapes;
}

function rebuildBoothEntranceCandidates(item) {
  const cells = boothCellsFromShapes(item);
  const candidates = new Map();
  const dirs = [
    { dr: -1, dc: 0, side: "top" },
    { dr: 1, dc: 0, side: "bottom" },
    { dr: 0, dc: -1, side: "left" },
    { dr: 0, dc: 1, side: "right" }
  ];

  for (const key of cells) {
    const [row, col] = key.split(",").map(Number);
    for (const dir of dirs) {
      const nextRow = row + dir.dr;
      const nextCol = col + dir.dc;
      if (!isWalkable(nextRow, nextCol)) continue;
      const candidateKey = `${nextRow},${nextCol},${dir.side}`;
      if (!candidates.has(candidateKey)) {
        candidates.set(candidateKey, {
          row: nextRow, col: nextCol, side: dir.side,
          boothRow: row, boothCol: col
        });
      }
    }
  }
  item.entranceCandidates = [...candidates.values()];
}

function splitBoothComponentAtPoint(item, point) {
  const components = connectedBoothComponents(item);
  if (components.length < 2) {
    alert("이 부스는 떨어진 영역이 없어 자동 분리할 수 없습니다.");
    boothSplitMode = false;
    return false;
  }

  const row = Math.floor(point.y / cellPx) + 1;
  const col = Math.floor(point.x / cellPx) + 1;
  const selectedComponent = components.find((component) => component.has(`${row},${col}`));
  if (!selectedComponent) {
    alert("분리할 부스 영역 안쪽을 클릭하세요.");
    return false;
  }

  const proposed = prompt("분리할 영역의 새 부스번호를 입력하세요.", "");
  if (proposed === null) {
    boothSplitMode = false;
    return false;
  }
  const newId = String(proposed).trim().toUpperCase();
  if (!newId) {
    alert("새 부스번호를 입력해야 합니다.");
    return false;
  }
  if (gridMap.destinations.some((destination) => destination.id === newId)) {
    alert("이미 사용 중인 부스번호입니다.");
    return false;
  }

  const allCells = boothCellsFromShapes(item);
  const remainingCells = new Set([...allCells].filter((key) => !selectedComponent.has(key)));
  const color = item.shapes?.find((shape) => shape.color)?.color || "DCE9F7";

  item.shapes = cellsToBoothShapes(remainingCells, color);
  rebuildBoothEntranceCandidates(item);

  const newItem = {
    id: newId, booth: newId, name: newId,
    category: item.category || "부스",
    keywords: [], type: item.type || "booth",
    shapes: cellsToBoothShapes(selectedComponent, color),
    entranceCandidates: []
  };
  rebuildBoothEntranceCandidates(newItem);
  gridMap.destinations.push(newItem);
  gridMap.destinations.sort((a, b) => a.id.localeCompare(b.id, "ko", { numeric: true }));
  gridMap.stats ||= {};
  gridMap.stats.boothCount = gridMap.destinations.length;
  gridMap.stats.duplicateShapeCount = gridMap.destinations.filter((destination) => destination.shapes.length > 1).length;
  gridMap.stats.noEntrance = gridMap.destinations
    .filter((destination) => !destination.entranceCandidates?.length)
    .map((destination) => destination.id);

  storage.setItem(config.STORAGE_KEYS.GRID_MAP, JSON.stringify(gridMap));
  broadcastLocalStateChange("booth-split");
  delete boothLabelOverrides[item.id];
  delete boothLabelOverrides[newId];
  saveBoothLabelOverrides();

  selectedBoothLabelId = newId;
  boothSplitMode = false;
  renderGridPreservingView();
  return true;
}

function cellsToBoundaryLoops(cells) {
  const pointKey = (x, y) => `${x},${y}`;
  const components = [];
  const unvisited = new Set(cells);
  const directions = [[-1,0],[1,0],[0,-1],[0,1]];

  while (unvisited.size) {
    const first = unvisited.values().next().value;
    const queue = [first];
    const component = new Set();
    unvisited.delete(first);
    while (queue.length) {
      const key = queue.pop();
      component.add(key);
      const [r,c] = key.split(',').map(Number);
      for (const [dr,dc] of directions) {
        const nk = `${r+dr},${c+dc}`;
        if (unvisited.has(nk)) {
          unvisited.delete(nk);
          queue.push(nk);
        }
      }
    }
    components.push(component);
  }

  const loops = [];
  for (const component of components) {
    const edges = [];
    for (const key of component) {
      const [r,c] = key.split(',').map(Number);
      const x1 = c - 1, x2 = c, y1 = r - 1, y2 = r;
      if (!component.has(`${r-1},${c}`)) edges.push({a:[x1,y1], b:[x2,y1]});
      if (!component.has(`${r},${c+1}`)) edges.push({a:[x2,y1], b:[x2,y2]});
      if (!component.has(`${r+1},${c}`)) edges.push({a:[x2,y2], b:[x1,y2]});
      if (!component.has(`${r},${c-1}`)) edges.push({a:[x1,y2], b:[x1,y1]});
    }

    const byStart = new Map();
    edges.forEach((edge, index) => {
      const key = pointKey(...edge.a);
      if (!byStart.has(key)) byStart.set(key, []);
      byStart.get(key).push(index);
    });
    const used = new Set();
    for (let startIndex = 0; startIndex < edges.length; startIndex++) {
      if (used.has(startIndex)) continue;
      const startEdge = edges[startIndex];
      const loop = [startEdge.a];
      let currentIndex = startIndex;
      let guard = 0;
      while (!used.has(currentIndex) && guard++ < edges.length + 5) {
        used.add(currentIndex);
        const edge = edges[currentIndex];
        loop.push(edge.b);
        const nextKey = pointKey(...edge.b);
        const candidates = (byStart.get(nextKey) || []).filter((i) => !used.has(i));
        if (!candidates.length) break;
        currentIndex = candidates[0];
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

function loopsToPathData(loops, offsetX = 0, offsetY = 0) {
  return (loops || []).map((loop) => {
    const points = loop.map(([x, y]) => [x * cellPx + offsetX, y * cellPx + offsetY]);
    return points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ') + ' Z';
  }).join(' ');
}

function hexToRgb(hex) {
  const value = String(hex || '').replace(/[^0-9a-f]/gi, '');
  const source = value.length === 3
    ? value.split('').map((ch) => ch + ch).join('')
    : value.padStart(6, '0').slice(0, 6);
  return {
    r: parseInt(source.slice(0, 2), 16),
    g: parseInt(source.slice(2, 4), 16),
    b: parseInt(source.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function tintHex(hex, amount = 0) {
  const rgb = hexToRgb(hex);
  if (amount >= 0) {
    return rgbToHex({
      r: rgb.r + (255 - rgb.r) * amount,
      g: rgb.g + (255 - rgb.g) * amount,
      b: rgb.b + (255 - rgb.b) * amount
    });
  }
  const factor = 1 + amount;
  return rgbToHex({ r: rgb.r * factor, g: rgb.g * factor, b: rgb.b * factor });
}

function buildBoothDepthComponents(destinations) {
  const colorGroups = new Map();
  for (const item of destinations || []) {
    const color = item?.shapes?.find((shape) => shape.color)?.color || 'DCE9F7';
    if (!colorGroups.has(color)) colorGroups.set(color, new Set());
    const bucket = colorGroups.get(color);
    for (const key of boothCellsFromShapes(item)) bucket.add(key);
  }

  const blocks = [];
  for (const [color, cells] of colorGroups.entries()) {
    const remaining = new Set(cells);
    while (remaining.size) {
      const first = remaining.values().next().value;
      const queue = [first];
      const component = new Set([first]);
      remaining.delete(first);
      while (queue.length) {
        const key = queue.pop();
        const [row, col] = key.split(',').map(Number);
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const next = `${row + dr},${col + dc}`;
          if (!remaining.has(next)) continue;
          remaining.delete(next);
          component.add(next);
          queue.push(next);
        }
      }
      blocks.push({ color, cells: component, loops: cellsToBoundaryLoops(component) });
    }
  }
  return blocks;
}


function appendSelectedBoothExtrusion(depthLayer, item) {
  if (!depthLayer || !item?.shapes?.length) return;

  const cells = boothCellsFromShapes(item);
  if (!cells.size) return;

  const color = item.shapes.find((shape) => shape.color)?.color || "DCE9F7";
  const { dx, dy } = selectedBoothLiftVector(item.id);
  const rightFaceColor = tintHex(color, -0.28);
  const bottomFaceColor = tintHex(color, -0.38);

  const rightByCol = new Map();
  const bottomByRow = new Map();

  /*
   * 선택 부스의 원래 상판 경계에서 상승한 상판까지를 연결한다.
   * 별도 3D 객체를 얹는 것이 아니라 기본 측면이 같은 색과 같은 각도로
   * 그대로 연장되는 구조다.
   */
  for (const key of cells) {
    const [row, col] = key.split(",").map(Number);

    if (!cells.has(`${row},${col + 1}`)) {
      if (!rightByCol.has(col)) rightByCol.set(col, []);
      rightByCol.get(col).push(row);
    }

    if (!cells.has(`${row + 1},${col}`)) {
      if (!bottomByRow.has(row)) bottomByRow.set(row, []);
      bottomByRow.get(row).push(col);
    }
  }

  const appendRightFace = (col, startRow, endRow) => {
    const x = col * cellPx;
    const y1 = (startRow - 1) * cellPx;
    const y2 = endRow * cellPx;
    depthLayer.appendChild(svgEl("polygon", {
      points: `${x - dx},${y1 - dy} ${x},${y1} ${x},${y2} ${x - dx},${y2 - dy}`,
      fill: rightFaceColor,
      stroke: rightFaceColor,
      "stroke-width": "0.45",
      "stroke-linejoin": "round",
      "shape-rendering": "geometricPrecision",
      class: "selected-booth-extrusion-face selected-booth-extrusion-right"
    }));
  };

  const appendBottomFace = (row, startCol, endCol) => {
    const y = row * cellPx;
    const x1 = (startCol - 1) * cellPx;
    const x2 = endCol * cellPx;
    depthLayer.appendChild(svgEl("polygon", {
      points: `${x1 - dx},${y - dy} ${x2 - dx},${y - dy} ${x2},${y} ${x1},${y}`,
      fill: bottomFaceColor,
      stroke: bottomFaceColor,
      "stroke-width": "0.45",
      "stroke-linejoin": "round",
      "shape-rendering": "geometricPrecision",
      class: "selected-booth-extrusion-face selected-booth-extrusion-bottom"
    }));
  };

  for (const [col, rows] of rightByCol.entries()) {
    rows.sort((a, b) => a - b);
    let start = rows[0];
    let end = rows[0];
    for (let i = 1; i <= rows.length; i++) {
      const current = rows[i];
      if (current === end + 1) {
        end = current;
        continue;
      }
      appendRightFace(col, start, end);
      start = current;
      end = current;
    }
  }

  for (const [row, cols] of bottomByRow.entries()) {
    cols.sort((a, b) => a - b);
    let start = cols[0];
    let end = cols[0];
    for (let i = 1; i <= cols.length; i++) {
      const current = cols[i];
      if (current === end + 1) {
        end = current;
        continue;
      }
      appendBottomFace(row, start, end);
      start = current;
      end = current;
    }
  }
}

function renderBoothDepthLayer() {
  if (!floorMap || !gridMap) return;
  const { dx, dy } = boothDepthVector();
  const depthLayer = svgEl('g', { id: 'boothDepthLayer' });

  for (const block of buildBoothDepthComponents(gridMap.destinations)) {
    /*
     * 우측면과 아랫면은 셀마다 따로 그리지 않고,
     * 연속된 외곽 구간을 하나의 면으로 합쳐 그린다.
     * 셀 단위 폴리곤 사이에서 보이던 흰색 이음선이 사라진다.
     */
    const rightByCol = new Map();
    const bottomByRow = new Map();

    for (const key of block.cells) {
      const [row, col] = key.split(',').map(Number);

      if (!block.cells.has(`${row},${col + 1}`)) {
        if (!rightByCol.has(col)) rightByCol.set(col, []);
        rightByCol.get(col).push(row);
      }

      if (!block.cells.has(`${row + 1},${col}`)) {
        if (!bottomByRow.has(row)) bottomByRow.set(row, []);
        bottomByRow.get(row).push(col);
      }
    }

    for (const [col, rows] of rightByCol.entries()) {
      rows.sort((a, b) => a - b);
      let start = rows[0];
      let previous = rows[0];

      const flush = () => {
        const x = col * cellPx;
        const y1 = (start - 1) * cellPx;
        const y2 = previous * cellPx;
        const faceColor = tintHex(block.color, -0.28);
        depthLayer.appendChild(svgEl('polygon', {
          points: `${x},${y1} ${x + dx},${y1 + dy} ${x + dx},${y2 + dy} ${x},${y2}`,
          fill: faceColor,
          stroke: faceColor,
          'stroke-width': '0.45',
          'stroke-linejoin': 'round',
          'shape-rendering': 'geometricPrecision'
        }));
      };

      for (let index = 1; index <= rows.length; index++) {
        const current = rows[index];
        if (current === previous + 1) {
          previous = current;
          continue;
        }
        flush();
        start = current;
        previous = current;
      }
    }

    for (const [row, cols] of bottomByRow.entries()) {
      cols.sort((a, b) => a - b);
      let start = cols[0];
      let previous = cols[0];

      const flush = () => {
        const y = row * cellPx;
        const x1 = (start - 1) * cellPx;
        const x2 = previous * cellPx;
        const faceColor = tintHex(block.color, -0.38);
        depthLayer.appendChild(svgEl('polygon', {
          points: `${x1},${y} ${x1 + dx},${y + dy} ${x2 + dx},${y + dy} ${x2},${y}`,
          fill: faceColor,
          stroke: faceColor,
          'stroke-width': '0.45',
          'stroke-linejoin': 'round',
          'shape-rendering': 'geometricPrecision'
        }));
      };

      for (let index = 1; index <= cols.length; index++) {
        const current = cols[index];
        if (current === previous + 1) {
          previous = current;
          continue;
        }
        flush();
        start = current;
        previous = current;
      }
    }

  }

  floorMap.insertBefore(depthLayer, boothsLayer);
}

function renderSelectedBoothExtrusionLayer(item) {
  document.querySelector("#selectedBoothExtrusionLayer")?.remove();
  if (!floorMap || !item?.shapes?.length) return null;

  const layer = svgEl("g", {
    id: "selectedBoothExtrusionLayer",
    "pointer-events": "none"
  });
  appendSelectedBoothExtrusion(layer, item);

  /*
   * 선택 부스의 기둥은 일반 부스 상판보다 위에 있어야
   * 인접 부스와 맞닿은 우측면·하단면도 가려지지 않는다.
   * 선택 상판 그룹은 이 레이어 다음에 추가되어 기둥의 최상단을 덮는다.
   */
  boothsLayer.parentNode.insertBefore(layer, boothsLayer.nextSibling);
  return layer;
}

function buildBoothPolygonGeometry(item) {
  const shapes = item?.shapes || [];
  if (!shapes.length) return null;

  const cells = new Set();
  for (const shape of shapes) {
    for (let r = shape.r1; r <= shape.r2; r++) {
      for (let c = shape.c1; c <= shape.c2; c++) cells.add(`${r},${c}`);
    }
  }

  const unvisited = new Set(cells);
  const components = [];
  const directions = [[-1,0],[1,0],[0,-1],[0,1]];
  while (unvisited.size) {
    const first = unvisited.values().next().value;
    const queue = [first];
    const component = new Set();
    unvisited.delete(first);
    while (queue.length) {
      const key = queue.pop();
      component.add(key);
      const [r,c] = key.split(',').map(Number);
      for (const [dr,dc] of directions) {
        const nk = `${r+dr},${c+dc}`;
        if (unvisited.has(nk)) {
          unvisited.delete(nk);
          queue.push(nk);
        }
      }
    }
    components.push(component);
  }

  const pointKey = (x,y) => `${x},${y}`;
  const loops = [];
  for (const component of components) {
    const edges = [];
    for (const key of component) {
      const [r,c] = key.split(',').map(Number);
      const x1 = c - 1, x2 = c, y1 = r - 1, y2 = r;
      if (!component.has(`${r-1},${c}`)) edges.push({a:[x1,y1], b:[x2,y1]});
      if (!component.has(`${r},${c+1}`)) edges.push({a:[x2,y1], b:[x2,y2]});
      if (!component.has(`${r+1},${c}`)) edges.push({a:[x2,y2], b:[x1,y2]});
      if (!component.has(`${r},${c-1}`)) edges.push({a:[x1,y2], b:[x1,y1]});
    }

    const byStart = new Map();
    edges.forEach((edge, index) => {
      const key = pointKey(...edge.a);
      if (!byStart.has(key)) byStart.set(key, []);
      byStart.get(key).push(index);
    });
    const used = new Set();
    for (let startIndex = 0; startIndex < edges.length; startIndex++) {
      if (used.has(startIndex)) continue;
      const startEdge = edges[startIndex];
      const loop = [startEdge.a];
      let currentIndex = startIndex;
      let guard = 0;
      while (!used.has(currentIndex) && guard++ < edges.length + 5) {
        used.add(currentIndex);
        const edge = edges[currentIndex];
        loop.push(edge.b);
        const nextKey = pointKey(...edge.b);
        const candidates = (byStart.get(nextKey) || []).filter((idx) => !used.has(idx));
        if (!candidates.length) break;
        currentIndex = candidates[0];
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }

  const pathData = loops.map((loop) => {
    const points = loop.map(([x,y]) => [x * cellPx, y * cellPx]);
    return points.map(([x,y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ') + ' Z';
  }).join(' ');

  /*
   * 다각형 전체를 기준으로 라벨 위치와 크기를 계산한다.
   * 이전에는 압축된 shapes 중 가장 큰 사각형 하나만 기준으로 삼아,
   * L자 부스가 가느다란 행 단위 사각형으로 나뉘면 부스번호가 숨겨졌다.
   */
  const occupiedCells = [...cells].map((key) => {
    const [row, col] = key.split(",").map(Number);
    return { row, col };
  });

  const minRow = Math.min(...occupiedCells.map((cell) => cell.row));
  const maxRow = Math.max(...occupiedCells.map((cell) => cell.row));
  const minCol = Math.min(...occupiedCells.map((cell) => cell.col));
  const maxCol = Math.max(...occupiedCells.map((cell) => cell.col));

  const centroidRow = occupiedCells.reduce((sum, cell) => sum + cell.row, 0) / occupiedCells.length;
  const centroidCol = occupiedCells.reduce((sum, cell) => sum + cell.col, 0) / occupiedCells.length;

  const occupied = new Set(cells);
  const boundaryDistance = new Map();
  let frontier = [];

  for (const cell of occupiedCells) {
    const isBoundary = directions.some(([dr, dc]) => !occupied.has(`${cell.row + dr},${cell.col + dc}`));
    if (isBoundary) {
      const key = `${cell.row},${cell.col}`;
      boundaryDistance.set(key, 0);
      frontier.push(cell);
    }
  }

  let layer = 0;
  while (frontier.length) {
    const next = [];
    for (const cell of frontier) {
      const currentKey = `${cell.row},${cell.col}`;
      const currentDistance = boundaryDistance.get(currentKey) || 0;
      for (const [dr, dc] of directions) {
        const row = cell.row + dr;
        const col = cell.col + dc;
        const key = `${row},${col}`;
        if (!occupied.has(key) || boundaryDistance.has(key)) continue;
        boundaryDistance.set(key, currentDistance + 1);
        next.push({ row, col });
      }
    }
    frontier = next;
    layer++;
  }

  const labelW = (maxCol - minCol + 1) * cellPx;
  const labelH = (maxRow - minRow + 1) * cellPx;
  const boundingCellCount =
    (maxCol - minCol + 1) *
    (maxRow - minRow + 1);
  const isPerfectRectangle =
    occupiedCells.length === boundingCellCount;

  let labelX;
  let labelY;

  if (isPerfectRectangle) {
    /*
     * 일반 사각형 부스는 셀 하나의 중심이 아니라
     * 부스 외곽 전체의 기하학적 정중앙에 배치한다.
     */
    labelX = ((minCol - 1) + (maxCol - minCol + 1) / 2) * cellPx;
    labelY = ((minRow - 1) + (maxRow - minRow + 1) / 2) * cellPx;
  } else {
    /*
     * L자·ㄷ자 등 비정형 부스는 실제 부스 내부의 여유 공간을 우선하되,
     * 기계적인 중심보다 우측·아래 방향으로 약간 이동해 자연스럽게 보이게 한다.
     */
    const targetRow = centroidRow + (maxRow - minRow + 1) * 0.14;
    const targetCol = centroidCol + (maxCol - minCol + 1) * 0.14;

    occupiedCells.sort((a, b) => {
      const clearanceA = boundaryDistance.get(`${a.row},${a.col}`) || 0;
      const clearanceB = boundaryDistance.get(`${b.row},${b.col}`) || 0;

      /* 여유 공간 차이가 큰 경우에만 안쪽 셀을 우선한다. */
      if (Math.abs(clearanceA - clearanceB) >= 2) {
        return clearanceB - clearanceA;
      }

      const distanceA =
        (a.row - targetRow) ** 2 +
        (a.col - targetCol) ** 2;
      const distanceB =
        (b.row - targetRow) ** 2 +
        (b.col - targetCol) ** 2;
      return distanceA - distanceB;
    });

    const labelCell = occupiedCells[0];
    labelX = (labelCell.col - 0.5) * cellPx;
    labelY = (labelCell.row - 0.5) * cellPx;

    /* 선택 셀 안에서도 우측·아래로 아주 조금 이동한다. */
    labelX += cellPx * 0.12;
    labelY += cellPx * 0.10;
  }
  const boothArea = occupiedCells.length * cellPx * cellPx;
  const color = shapes.find((shape) => shape.color)?.color || 'DCE9F7';

  return {
    pathData,
    loops,
    labelX,
    labelY,
    labelW,
    labelH,
    boothArea,
    color
  };
}

function selectedBoothItem() {
  if (!selectedDestination || !gridMap) return null;
  return gridMap.destinations.find((item) => item.id === selectedDestination.id) || null;
}

function updateSelectedBoothDisplay(item) {
  if (!item) return;
  const companyName = item.name && item.name !== item.id ? item.name : "";
  selectedCard?.classList.remove("hidden");
  if (selectedName) selectedName.textContent = companyName ? `${item.id} ${companyName}` : item.id;
  if (selectedMeta) selectedMeta.textContent = companyName
    ? `${item.id} ${companyName} 부스를 선택했습니다.`
    : `${item.id} 부스를 선택했습니다.`;
  if (routeInfo) routeInfo.textContent = companyName
    ? `${item.id} ${companyName} 부스를 선택했습니다.`
    : `${item.id} 부스를 선택했습니다.`;
}

function renderGridPreservingView() {
  const savedView = { ...currentViewBox };
  const savedFull = { ...fullViewBox };

  renderGrid();

  const sameMap =
    Math.abs(savedFull.width - fullViewBox.width) < 0.01 &&
    Math.abs(savedFull.height - fullViewBox.height) < 0.01;

  if (!sameMap) return;

  const width = Math.max(1, Math.min(savedView.width, fullViewBox.width));
  const height = Math.max(1, Math.min(savedView.height, fullViewBox.height));
  const x = Math.max(0, Math.min(fullViewBox.width - width, savedView.x));
  const y = Math.max(0, Math.min(fullViewBox.height - height, savedView.y));

  currentViewBox = { x, y, width, height };
  applyViewBox();
}


function boothDepthVector() {
  return {
    dx: Math.max(4, cellPx * 0.34),
    dy: Math.max(3, cellPx * 0.26)
  };
}

function selectedBoothLiftVector(itemId = selectedBoothOverrideId()) {
  /*
   * 기본 3D와 같은 대각선 각도를 유지하면서 전체 부스 공통 배수를 적용한다.
   * 기본값 2.65, 허용 범위 0~8이다.
   */
  const base = boothDepthVector();
  const multiplier = globalBoothLiftMultiplier();
  return {
    dx: base.dx * multiplier,
    dy: base.dy * multiplier
  };
}

function applySelectedBoothLift(group, item) {
  if (!group) return;
  const { dx, dy } = selectedBoothLiftVector(item?.id);
  group.style.transformBox = "fill-box";
  group.style.transformOrigin = "center";
  group.style.transform = "translate(0px, 0px)";
  group.style.filter = "none";
  group.style.transition = "transform 420ms cubic-bezier(.22,.72,.24,1)";
  requestAnimationFrame(() => {
    group.style.transform = `translate(${-dx}px, ${-dy}px)`;
  });
}

function renderSelectedBoothOverlay(item, geometry) {
  document.querySelector("#selectedBoothOverlay")?.remove();
  if (!item || !geometry?.pathData) return;

  const { dx, dy } = selectedBoothLiftVector(item.id);
  const overlay = svgEl("g", {
    id: "selectedBoothOverlay",
    "pointer-events": "none"
  });
  overlay.style.transformBox = "fill-box";
  overlay.style.transformOrigin = "center";
  overlay.style.transform = "translate(0px, 0px)";
  overlay.style.opacity = "0";
  overlay.style.transition = "transform 420ms cubic-bezier(.2,.78,.22,1), opacity 180ms ease";

  const outline = svgEl("path", {
    d: geometry.pathData,
    fill: "none",
    stroke: "#ef4444",
    "stroke-width": Math.max(3.4, cellPx * 0.40),
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
    "vector-effect": "non-scaling-stroke"
  });
  overlay.append(outline);
  floorMap.insertBefore(overlay, routeLine);
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    overlay.style.transform = `translate(${-dx}px, ${-dy}px)`;
  });
}



function boothGeometryBounds(item) {
  const shapes = item?.shapes || [];
  if (!shapes.length) return null;
  return {
    x1: (Math.min(...shapes.map((shape) => shape.c1)) - 1) * cellPx,
    y1: (Math.min(...shapes.map((shape) => shape.r1)) - 1) * cellPx,
    x2: Math.max(...shapes.map((shape) => shape.c2)) * cellPx,
    y2: Math.max(...shapes.map((shape) => shape.r2)) * cellPx
  };
}

function ensureBoothSpecialEffectDefs() {
  if (!floorMap || floorMap.querySelector("#boothSpecialEffectDefs")) return;
  const defs = svgEl("defs", { id: "boothSpecialEffectDefs" });
  defs.innerHTML = `
    <linearGradient id="boothDiamondBlue" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f4fdff"/>
      <stop offset=".17" stop-color="#8fe9ff"/>
      <stop offset=".48" stop-color="#24aee8"/>
      <stop offset=".75" stop-color="#0877c5"/>
      <stop offset="1" stop-color="#033a78"/>
    </linearGradient>
    <linearGradient id="boothDiamondTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".42" stop-color="#9cecff"/>
      <stop offset="1" stop-color="#1a9dd9"/>
    </linearGradient>
    <linearGradient id="boothDiamondLeft" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#70ddff"/>
      <stop offset="1" stop-color="#0877bb"/>
    </linearGradient>
    <linearGradient id="boothDiamondRight" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f8ed7"/>
      <stop offset="1" stop-color="#013766"/>
    </linearGradient>
    <linearGradient id="boothCrownGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fffde8"/>
      <stop offset=".12" stop-color="#fff39a"/>
      <stop offset=".34" stop-color="#ffd22d"/>
      <stop offset=".56" stop-color="#d79200"/>
      <stop offset=".74" stop-color="#ffe56f"/>
      <stop offset="1" stop-color="#9a5100"/>
    </linearGradient>
    <linearGradient id="boothCrownBand" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff7af"/>
      <stop offset=".38" stop-color="#f4bd17"/>
      <stop offset=".72" stop-color="#b76900"/>
      <stop offset="1" stop-color="#ffe47c"/>
    </linearGradient>
    <radialGradient id="boothSparkCore">
      <stop offset="0" stop-color="#fff"/>
      <stop offset=".24" stop-color="#fff8b8"/>
      <stop offset=".62" stop-color="#ffd12f" stop-opacity=".98"/>
      <stop offset="1" stop-color="#ff7a00" stop-opacity="0"/>
    </radialGradient>
    <filter id="boothIconShadow" x="-100%" y="-100%" width="300%" height="300%">
      <feDropShadow dx="0" dy="2" stdDeviation="1.8" flood-color="#0f172a" flood-opacity=".48"/>
    </filter>
    <filter id="boothGemGlow" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="1.1" result="g"/>
      <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.78  0 0 0 0 1  0 0 0 1 0" result="c"/>
      <feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="boothGoldGlow" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="1.7" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  floorMap.insertBefore(defs, floorMap.firstChild);
}

function appendSparklerParticle(parent, pathData, delay, scale = 1) {
  const spark = svgEl("g", { class: "booth-event-sparkler", "pointer-events": "none" });
  const core = svgEl("circle", { r: 2.3 * scale, fill: "url(#boothSparkCore)" });
  spark.appendChild(core);
  const rayCount = 10;
  for (let i = 0; i < rayCount; i++) {
    const angle = (Math.PI * 2 * i) / rayCount;
    const inner = 2.2 * scale;
    const outer = (5.4 + (i % 3) * 1.6) * scale;
    spark.appendChild(svgEl("line", {
      x1: Math.cos(angle) * inner,
      y1: Math.sin(angle) * inner,
      x2: Math.cos(angle) * outer,
      y2: Math.sin(angle) * outer,
      stroke: i % 2 ? "#fff9c6" : "#ffd02f",
      "stroke-width": Math.max(.55, .8 * scale),
      "stroke-linecap": "round"
    }));
  }
  const motion = svgEl("animateMotion", {
    path: pathData,
    dur: "3.4s",
    begin: `${delay}s`,
    repeatCount: "indefinite",
    rotate: "auto"
  });
  spark.appendChild(motion);
  parent.appendChild(spark);
}

function renderBoothSpecialEffect(group, item, geometry) {
  if (!group || !item || !geometry?.pathData) return;
  const specialType = boothLabelOverrideFor(item.id).specialType || "none";
  if (specialType === "none") return;

  ensureBoothSpecialEffectDefs();
  const bounds = boothGeometryBounds(item);
  if (!bounds) return;
  const width = Math.max(cellPx, bounds.x2 - bounds.x1);
  const height = Math.max(cellPx, bounds.y2 - bounds.y1);
  // 아이콘은 부스 우측 상단에 작게 배치하여 중앙 부스번호를 가리지 않는다.
  const size = Math.max(14, Math.min(26, Math.min(width, height) * 0.54));
  const iconX = bounds.x2 - size * 0.43;
  const iconY = bounds.y1 + size * 0.40;

  if (specialType === "event") {
    const glow = svgEl("path", {
      d: geometry.pathData,
      fill: "none",
      stroke: "#f6b913",
      "stroke-width": Math.max(2.4, cellPx * 0.28),
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      "vector-effect": "non-scaling-stroke",
      class: "booth-special-event-glow",
      "pointer-events": "none"
    });
    const ember = svgEl("path", {
      d: geometry.pathData,
      fill: "none",
      stroke: "#fff7a6",
      "stroke-width": Math.max(1.1, cellPx * 0.12),
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      "stroke-dasharray": "1 10 3 15",
      "vector-effect": "non-scaling-stroke",
      class: "booth-special-event-spark",
      "pointer-events": "none"
    });
    const particles = svgEl("g", { class: "booth-event-particles", "pointer-events": "none" });
    appendSparklerParticle(particles, geometry.pathData, 0, 1);
    appendSparklerParticle(particles, geometry.pathData, -1.13, .82);
    appendSparklerParticle(particles, geometry.pathData, -2.26, .68);
    group.append(glow, ember, particles);
    return;
  }

  const icon = svgEl("g", {
    class: "booth-special-icon",
    transform: `translate(${iconX} ${iconY})`,
    "pointer-events": "none",
    filter: "url(#boothIconShadow)"
  });

  const addGlint = (parent, x, y, scale = 1, secondary = false) => {
    const glint = svgEl("g", {
      class: secondary ? "booth-photo-icon-glint booth-photo-icon-glint-secondary" : "booth-photo-icon-glint",
      transform: `translate(${x} ${y}) scale(${scale})`
    });
    glint.append(
      svgEl("line", { x1: 0, y1: -6, x2: 0, y2: 6, stroke: "#fff", "stroke-width": 1.45, "stroke-linecap": "round" }),
      svgEl("line", { x1: -6, y1: 0, x2: 6, y2: 0, stroke: "#fff", "stroke-width": 1.45, "stroke-linecap": "round" }),
      svgEl("line", { x1: -3.8, y1: -3.8, x2: 3.8, y2: 3.8, stroke: "#fff7c7", "stroke-width": .75, "stroke-linecap": "round" }),
      svgEl("line", { x1: 3.8, y1: -3.8, x2: -3.8, y2: 3.8, stroke: "#fff7c7", "stroke-width": .75, "stroke-linecap": "round" })
    );
    parent.appendChild(glint);
  };

  if (specialType === "premium") {
    const diamond = svgEl("g", { class: "booth-photo-icon booth-special-premium" });
    diamond.appendChild(svgEl("ellipse", {
      cx: 0, cy: size * .55, rx: size * .42, ry: size * .095,
      fill: "#075985", opacity: ".22", class: "booth-icon-ground-shadow"
    }));
    diamond.appendChild(svgEl("image", {
      href: "assets/booth-special/diamond-3d.gif",
      x: -size * .63,
      y: -size * .63,
      width: size * 1.26,
      height: size * 1.26,
      preserveAspectRatio: "xMidYMid meet",
      class: "booth-photo-icon-image booth-diamond-photo"
    }));
    addGlint(diamond, size * .30, -size * .29, .72);
    addGlint(diamond, -size * .27, -size * .12, .42, true);
    icon.appendChild(diamond);
  } else if (specialType === "awards") {
    const crown = svgEl("g", { class: "booth-photo-icon booth-special-awards" });
    crown.appendChild(svgEl("ellipse", {
      cx: 0, cy: size * .53, rx: size * .43, ry: size * .10,
      fill: "#92400e", opacity: ".22", class: "booth-icon-ground-shadow"
    }));
    crown.appendChild(svgEl("image", {
      href: "assets/booth-special/crown-3d.png",
      x: -size * .68,
      y: -size * .63,
      width: size * 1.36,
      height: size * 1.20,
      preserveAspectRatio: "xMidYMid meet",
      class: "booth-photo-icon-image booth-crown-photo"
    }));
    addGlint(crown, size * .34, -size * .31, .70);
    addGlint(crown, -size * .30, -size * .10, .40, true);
    icon.appendChild(crown);
  }
  group.appendChild(icon);
}

function animateSelectedBoothExtrusion() {
  const faces = floorMap?.querySelectorAll(".selected-booth-extrusion-face") || [];
  for (const face of faces) {
    face.style.opacity = "0";
    face.style.transition = "opacity 300ms cubic-bezier(.22,.72,.24,1)";
  }
  requestAnimationFrame(() => {
    for (const face of faces) face.style.opacity = "1";
  });
}

function renderGrid() {
  /*
   * 편집·선택 작업으로 SVG를 다시 그릴 때 현재 확대/이동 위치를 유지한다.
   * 이전에는 renderGrid가 매번 currentViewBox를 전체보기로 초기화해,
   * 버튼 클릭이나 부스 선택 뒤 지도가 전체보기로 돌아가는 현상이 있었다.
   */
  const previousFullViewBox = { ...fullViewBox };
  const previousViewBox = { ...currentViewBox };

  clearMap();
  centerlineSkeleton = null;
  sampleMapLayer.style.display = "none";
  cellPx = Math.max(6, Math.min(14, 1500 / Math.max(gridMap.cols, gridMap.rows)));
  const nextFullViewBox = {
    x: 0,
    y: 0,
    width: gridMap.cols * cellPx,
    height: gridMap.rows * cellPx
  };
  const sameMapDimensions =
    Math.abs(previousFullViewBox.width - nextFullViewBox.width) < 0.01 &&
    Math.abs(previousFullViewBox.height - nextFullViewBox.height) < 0.01;

  fullViewBox = nextFullViewBox;
  if (sameMapDimensions && previousViewBox.width > 0 && previousViewBox.height > 0) {
    const width = Math.max(1, Math.min(previousViewBox.width, fullViewBox.width));
    const height = Math.max(1, Math.min(previousViewBox.height, fullViewBox.height));
    currentViewBox = {
      x: Math.max(0, Math.min(fullViewBox.width - width, previousViewBox.x)),
      y: Math.max(0, Math.min(fullViewBox.height - height, previousViewBox.y)),
      width,
      height
    };
  } else {
    currentViewBox = { ...fullViewBox };
  }
  floorMap.setAttribute(
    "viewBox",
    `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`
  );
  floorMap.style.aspectRatio = `${gridMap.cols} / ${gridMap.rows}`;
  document.documentElement.style.setProperty("--map-aspect", `${gridMap.cols} / ${gridMap.rows}`);
  document.documentElement.style.setProperty("--map-width-ratio", String(gridMap.cols / gridMap.rows));

  const bg = svgEl("g", { id: "gridBackground" });
  bg.appendChild(svgEl("rect", { x: 0, y: 0, width: fullViewBox.width, height: fullViewBox.height, fill: "#ffffff" }));
  for (const run of gridMap.runs || []) {
    bg.appendChild(svgEl("rect", {
      x: (run.c1 - 1) * cellPx, y: (run.row - 1) * cellPx,
      width: (run.c2 - run.c1 + 1) * cellPx, height: cellPx,
      fill: `#${run.color}`, stroke: "none"
    }));
  }
  floorMap.insertBefore(bg, boothsLayer);
  renderBoothDepthLayer();

  let selectedGroupForTop = null;
  let selectedGeometryForOverlay = null;
  let selectedItemForOverlay = null;

  for (const item of gridMap.destinations) {
    const isSelectedDestination = selectedDestination?.id === item.id;
    const group = svgEl("g", {
      class: `grid-booth-group${boothLabelEditMode && selectedBoothLabelId === item.id ? " booth-label-selected" : ""}${isSelectedDestination ? " destination-selected" : ""}`,
      "data-booth-id": item.id,
      "pointer-events": "all"
    });

    const geometry = buildBoothPolygonGeometry(item);
    if (geometry?.pathData) {
      const selectedLabel =
        boothLabelEditMode && selectedBoothLabelId === item.id;
      const path = svgEl("path", {
        d: geometry.pathData,
        fill: tintHex(geometry.color, 0.02),
        stroke: selectedLabel ? "#f59e0b" : tintHex(geometry.color, -0.42),
        "stroke-width": selectedLabel
          ? Math.max(1.6, cellPx * 0.18)
          : Math.max(0.8, cellPx * 0.09),
        "stroke-linejoin": "round",
        "fill-rule": "evenodd",
        class: "grid-booth grid-booth-polygon"
      });
      group.appendChild(path);

      path.addEventListener("pointerdown", (event) => {
        // 일반 사용자 화면에서는 pointerdown 즉시 부스를 선택하지 않는다.
        // 지도 앱처럼 손을 댄 뒤 이동/핀치 여부를 먼저 판별하고,
        // 실제 선택은 아래 group click 단계에서 짧은 탭일 때만 처리한다.
        if (!boothLabelEditMode || !isAdminScreen()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();

        if (boothSplitMode && selectedBoothLabelId === item.id) {
          splitBoothComponentAtPoint(
            item,
            clientToSvg(event.clientX, event.clientY)
          );
          return;
        }

        if (selectedBoothLabelId === item.id && boothLabelMoveMode) {
          const override = boothLabelOverrideFor(item.id);
          const startX = Number.isFinite(override.x) ? override.x : geometry.labelX;
          const startY = Number.isFinite(override.y) ? override.y : geometry.labelY;
          beginBoothLabelDrag(event, item, startX, startY);
          return;
        }

        selectedBoothLabelId = item.id;
        selectedDestination = item;
        updateSelectedBoothDisplay(item);
        updateBoothEditorInputs();
        boothLabelMoveMode = false;
        document.querySelector("#boothLabelMoveBtn")?.classList.remove("active");
        floorMap.classList.remove("booth-label-move-mode");
        renderGridPreservingView();
      });
      /*
       * 부스번호는 다각형 전체 면적에 맞춰 항상 표시한다.
       * 작은 부스는 글자를 축소하고, 큰 부스는 기존 최대 크기까지 확대한다.
       */
      const idLength = Math.max(2, String(item.id || "").length);
      const areaScale = Math.sqrt(Math.max(1, geometry.boothArea || 0));
      const fontSize = Math.max(
        3.5,
        Math.min(
          11,
          geometry.labelW / (idLength + 1.5),
          geometry.labelH / 2.2,
          areaScale / 3.2
        )
      );

      const labelOverride = boothLabelOverrideFor(item.id);
      const labelX = Number.isFinite(labelOverride.x)
        ? labelOverride.x
        : geometry.labelX;
      const labelY = Number.isFinite(labelOverride.y)
        ? labelOverride.y
        : geometry.labelY;
      const appliedFontSize = Number.isFinite(labelOverride.fontSize)
        ? labelOverride.fontSize
        : fontSize;
      const visible = labelOverride.visible !== false;

      if (visible || boothLabelEditMode) {
        const text = svgEl("text", {
          x: labelX,
          y: labelY,
          class: "grid-label",
          "font-size": appliedFontSize,
          "data-booth-label-id": item.id,
          "pointer-events": boothLabelMoveMode ? "all" : "none",
          cursor: boothLabelMoveMode ? "move" : "default",
          opacity: visible ? "1" : "0.28",
          fill: visible ? "#172033" : "#b91c1c"
        });
        text.textContent = item.id;
        text.addEventListener("pointerdown", (event) =>
          beginBoothLabelDrag(event, item, labelX, labelY)
        );
        text.addEventListener("click", (event) => {
          if (!boothLabelEditMode) return;
          event.preventDefault();
          event.stopPropagation();
          selectedBoothLabelId = item.id;
          renderGridPreservingView();
        });
        group.appendChild(text);
        if (boothLabelEditMode && boothLabelMoveMode && selectedBoothLabelId === item.id) {
          const hit = svgEl("circle", {
            cx: labelX,
            cy: labelY,
            r: Math.max(cellPx * 1.3, appliedFontSize * 1.8, 12),
            fill: "transparent",
            stroke: "#f59e0b",
            "stroke-width": Math.max(0.6, cellPx * 0.06),
            "stroke-dasharray": `${Math.max(2, cellPx * 0.35)} ${Math.max(2, cellPx * 0.25)}`,
            cursor: "move",
            "data-booth-label-hit": item.id
          });
          hit.addEventListener("pointerdown", (event) =>
            beginBoothLabelDrag(event, item, labelX, labelY)
          );
          group.appendChild(hit);
        }
      }
    }
    renderBoothSpecialEffect(group, item, geometry);

    // 모바일에서는 pointerdown 순간 선택하지 않는다. 지도 컨트롤러가
    // 이동·핀치·장시간 누름을 모두 판별한 뒤 pointerup에서 탭을 승인할 때만 선택한다.
    group.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch") return;
      ignoreSyntheticBoothClickUntil = performance.now() + 800;
      if (boothLabelEditMode && isAdminScreen()) return;
      if (!mapViewport?.consumeTouchTap?.(event.pointerId)) return;
      event.preventDefault();
      event.stopPropagation();
      handleBoothMapClick(item);
    });

    group.addEventListener("pointercancel", (event) => {
      if (event.pointerType === "touch") {
        ignoreSyntheticBoothClickUntil = performance.now() + 800;
        mapViewport?.consumeTouchTap?.(event.pointerId);
      }
    });

    group.addEventListener("click", (e) => {
      e.stopPropagation();

      // 모바일 터치 뒤 브라우저가 생성하는 합성 click은 항상 무시한다.
      // 터치 선택은 위 pointerup 승인 경로에서 이미 처리된다.
      if ((!boothLabelEditMode || !isAdminScreen()) && performance.now() < ignoreSyntheticBoothClickUntil) {
        e.preventDefault();
        return;
      }

      if ((!boothLabelEditMode || !isAdminScreen()) && mapViewport?.shouldSuppressTap?.()) {
        e.preventDefault();
        return;
      }

      if (boothLabelEditMode && isAdminScreen()) {
        if (boothSplitMode && selectedBoothLabelId === item.id) {
          splitBoothComponentAtPoint(
            item,
            clientToSvg(e.clientX, e.clientY)
          );
          return;
        }
        if (selectedBoothLabelId !== item.id) {
          boothLabelMoveMode = false;
          document.querySelector("#boothLabelMoveBtn")?.classList.remove("active");
          floorMap.classList.remove("booth-label-move-mode");
        }
        selectedBoothLabelId = item.id;
        selectedDestination = item;
        updateSelectedBoothDisplay(item);
        updateBoothEditorInputs();
        renderGridPreservingView();
        return;
      }
      handleBoothMapClick(item);
    });
    if (isSelectedDestination) {
      selectedGroupForTop = group;
      selectedGeometryForOverlay = geometry;
      selectedItemForOverlay = item;
    } else {
      boothsLayer.appendChild(group);
    }
  }
  if (selectedGroupForTop) {
    renderSelectedBoothExtrusionLayer(selectedItemForOverlay);
    boothsLayer.appendChild(selectedGroupForTop);
    applySelectedBoothLift(selectedGroupForTop, selectedItemForOverlay);
    animateSelectedBoothExtrusion();
    renderSelectedBoothOverlay(selectedItemForOverlay, selectedGeometryForOverlay);
  } else {
    document.querySelector("#selectedBoothOverlay")?.remove();
    document.querySelector("#selectedBoothExtrusionLayer")?.remove();
  }
  loadCenterlineOverrides();

  centerlineSkeleton = rebuildEditableCenterlineSkeleton();

  if (isAdminScreen()) {
    renderCenterlineDebug();
    ensureCenterlineEditorControls();
    ensureBoothLabelEditorControls();
    updateBoothEditorInputs();
  } else {
    centerlineDebugLayer?.remove();
    centerlineDebugLayer = null;
    ensureCenterlineDebugToggle();
  }
  renderManagedLocationMarkers();
  populateStarts();
  renderResults(searchInput?.value || "");
  updateStartMarker();
  const activeSelectedBooth = selectedBoothItem();
  if (activeSelectedBooth) {
    selectedDestination = activeSelectedBooth;
    updateSelectedBoothDisplay(activeSelectedBooth);
  } else {
    routeInfo.textContent = currentExhibitionName();
  }
}

function renderSample(destinations, locations) {
  clearMap();
  sampleMapLayer.style.display = "block";
  fullViewBox = { x: 0, y: 0, width: 1000, height: 650 };
  currentViewBox = { ...fullViewBox };
  floorMap.setAttribute("viewBox", "0 0 1000 650");
  floorMap.style.aspectRatio = "1000 / 650";
  document.documentElement.style.setProperty("--map-aspect", "1000 / 650");
  document.documentElement.style.setProperty("--map-width-ratio", String(1000 / 650));
  destinations.forEach((item) => {
    const g = svgEl("g");
    const rect = svgEl("rect", { x: item.x, y: item.y, width: item.width, height: item.height, rx: 8, class: item.type === "booth" ? "booth" : "facility" });
    const text = svgEl("text", { x: item.x + item.width / 2, y: item.y + item.height / 2, class: "map-label" });
    text.textContent = item.booth === "-" ? item.name : item.booth;
    g.append(rect, text);
    g.addEventListener("click", (event) => {
      if (mapViewport?.shouldSuppressTap?.()) {
        event.preventDefault();
        return;
      }
      selectDestination(item);
    });
    (item.type === "booth" ? boothsLayer : facilitiesLayer).appendChild(g);
  });
  if (startSelect) {
    startSelect.innerHTML = "";
    locations.forEach((loc) => { const o = new Option(loc.name, loc.id); o.dataset.x = loc.x; o.dataset.y = loc.y; startSelect.add(o); });
  }
  renderResults("");
  updateStartMarker();
}
