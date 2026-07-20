const $ = (s) => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
const floorMap = $("#floorMap");
const boothsLayer = $("#boothsLayer");
const facilitiesLayer = $("#facilitiesLayer");
const sampleMapLayer = $("#sampleMapLayer");
const routeLine = $("#routeLine");
const startMarker = $("#startMarker");
const destinationMarker = $("#destinationMarker");
const startSelect = $("#startSelect");
const searchInput = $("#searchInput");
const results = $("#results");
const selectedCard = $("#selectedCard");
const selectedName = $("#selectedName");
const selectedMeta = $("#selectedMeta");
const routeBtn = $("#routeBtn");
const routeInfo = $("#routeInfo");
const locationStatus = $("#locationStatus");
const pickStartBtn = $("#pickStartBtn");
const resetBtn = $("#resetBtn");

let gridMap = null;
let sampleDestinations = [];
let selectedDestination = null;
let customStart = null;
let startPickMode = false;
let adminLocationPickMode = false;
let editingLocationId = null;
let boothCorrectionMode = false;
let boothCorrectionSourceId = null;
let clearanceMap = null;
let cellPx = 10;
let fullViewBox = { x: 0, y: 0, width: 1000, height: 650 };
let currentViewBox = { ...fullViewBox };
let pointers = new Map();
let dragStart = null;
let pinchStartDistance = 0;
let pinchStartViewBox = null;

// 복도 중앙선 진단용 오버레이
let centerlineDebugVisible = true;
let centerlineDebugLayer = null;
let centerlineSkeleton = null;
let centerlineDisconnectedNodeIds = new Set();
let centerlineDisconnectedComponents = [];

// 관리자 중앙선 수동 편집
let centerlineEditMode = false;
let centerlineOverrides = {};
let centerlineDeletedNodes = new Set();
let centerlineBypasses = {};
let centerlineMergedNodes = {};
let centerlineCustomNodes = {};
let selectedCenterlineNodeKey = null;
let centerlineDrag = null;
const CENTERLINE_OVERRIDE_KEY = "exhibitionCenterlineOverrides";
const CENTERLINE_DELETED_KEY = "exhibitionCenterlineDeletedNodes";
const CENTERLINE_BYPASS_KEY = "exhibitionCenterlineBypasses";
const CENTERLINE_MERGE_KEY = "exhibitionCenterlineMergedNodes";
const CENTERLINE_CUSTOM_NODE_KEY = "exhibitionCenterlineCustomNodes";

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function normalize(s) { return String(s || "").toLowerCase().replace(/[\s-]/g, ""); }
function gridPoint(row, col) { return { x: (col - 0.5) * cellPx, y: (row - 0.5) * cellPx }; }
function isWalkable(row, col) {
  return !!gridMap && row >= 1 && row <= gridMap.rows && col >= 1 && col <= gridMap.cols && gridMap.walkableRows[row - 1][col - 1] === "1";
}


const DEPLOYMENT_STATE_PATH = "data/deployment-state.json";

const DEPLOYMENT_STORAGE_KEYS = [
  "exhibitionGridMap",
  "exhibitionGridMapOriginal",
  "exhibitionCustomStart",
  "exhibitionManagedLocations",
  "exhibitionImportedCompanies",
  "exhibitionBoothCorrections",
  CENTERLINE_OVERRIDE_KEY,
  CENTERLINE_DELETED_KEY,
  CENTERLINE_BYPASS_KEY,
  CENTERLINE_MERGE_KEY,
  CENTERLINE_CUSTOM_NODE_KEY
];

function collectDeploymentState() {
  const storage = {};

  for (const key of DEPLOYMENT_STORAGE_KEYS) {
    const value = localStorage.getItem(key);

    if (value !== null) {
      storage[key] = value;
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    storage
  };
}

function downloadDeploymentState() {
  const state = collectDeploymentState();
  const blob = new Blob(
    [JSON.stringify(state, null, 2)],
    { type: "application/json;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "deployment-state.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

async function applyDeploymentStateIfNeeded() {
  /*
   * 이미 현재 브라우저에 작업 데이터가 있으면 그것을 우선 사용한다.
   * 새 방문자처럼 저장 데이터가 없는 경우에만 GitHub의 배포 데이터를 적용한다.
   */
  if (localStorage.getItem("exhibitionGridMap")) {
    return false;
  }

  try {
    const response = await fetch(
      DEPLOYMENT_STATE_PATH,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return false;
    }

    const state = await response.json();

    if (
      !state ||
      typeof state.storage !== "object" ||
      state.storage === null
    ) {
      return false;
    }

    for (const [key, value] of Object.entries(state.storage)) {
      if (
        DEPLOYMENT_STORAGE_KEYS.includes(key) &&
        typeof value === "string"
      ) {
        localStorage.setItem(key, value);
      }
    }

    return true;
  } catch (error) {
    console.info(
      "배포 데이터 파일이 없거나 읽지 못했습니다.",
      error
    );

    return false;
  }
}

function ensureDeploymentExportButton() {
  if (!isAdminScreen()) return;

  const headerActions = document.querySelector(".header-actions");

  if (
    !headerActions ||
    document.querySelector("#exportDeploymentStateBtn")
  ) {
    return;
  }

  const button = document.createElement("button");
  button.id = "exportDeploymentStateBtn";
  button.type = "button";
  button.textContent = "배포 데이터 내보내기";
  button.title =
    "현재 브라우저에 저장된 전시장 배치·중앙선·위치 데이터를 JSON으로 저장";

  button.addEventListener("click", () => {
    downloadDeploymentState();

    alert(
      "deployment-state.json을 내려받았습니다.\n\n" +
      "GitHub 저장소의 data 폴더에 이 파일을 올리면 " +
      "새 방문자에게 현재 작업 상태가 기본값으로 적용됩니다."
    );
  });

  headerActions.prepend(button);
}

function loadStoredGrid() {
  try { gridMap = JSON.parse(localStorage.getItem("exhibitionGridMap") || "null"); }
  catch { gridMap = null; localStorage.removeItem("exhibitionGridMap"); }
}

async function loadSample() {
  try {
    const [dest, loc] = await Promise.all([
      fetch("data/destinations.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("data/locations.json", { cache: "no-store" }).then((r) => r.json())
    ]);
    sampleDestinations = dest;
    renderSample(dest, loc);
  } catch (e) {
    routeInfo.textContent = "관리자 화면에서 전시장 배치 엑셀을 등록해 주세요.";
  }
}

function clearMap() {
  centerlineDebugLayer?.remove();
  centerlineDebugLayer = null;
  boothsLayer.innerHTML = "";
  facilitiesLayer.innerHTML = "";
  routeLine.setAttribute("points", "");
  startMarker.style.display = "none";
  destinationMarker.style.display = "none";
}


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

function buildCenterlineDebugCells() {
  centerlineSkeleton ||= applyCenterlineCustomNodes(
    applyCenterlineNodeMerges(
      applyCenterlineDeletedNodes(
        buildSingleCenterlineSkeleton()
      )
    )
  );
  return centerlineSkeleton?.cells || [];
}


function loadCenterlineOverrides() {
  try {
    centerlineOverrides = JSON.parse(
      localStorage.getItem(CENTERLINE_OVERRIDE_KEY) || "{}"
    );
  } catch {
    centerlineOverrides = {};
    localStorage.removeItem(CENTERLINE_OVERRIDE_KEY);
  }

  try {
    centerlineDeletedNodes = new Set(
      JSON.parse(
        localStorage.getItem(CENTERLINE_DELETED_KEY) || "[]"
      )
    );
  } catch {
    centerlineDeletedNodes = new Set();
    localStorage.removeItem(CENTERLINE_DELETED_KEY);
  }

  try {
    centerlineBypasses = JSON.parse(
      localStorage.getItem(CENTERLINE_BYPASS_KEY) || "{}"
    );
  } catch {
    centerlineBypasses = {};
    localStorage.removeItem(CENTERLINE_BYPASS_KEY);
  }

  try {
    centerlineMergedNodes = JSON.parse(
      localStorage.getItem(CENTERLINE_MERGE_KEY) || "{}"
    );
  } catch {
    centerlineMergedNodes = {};
    localStorage.removeItem(CENTERLINE_MERGE_KEY);
  }

  try {
    centerlineCustomNodes = JSON.parse(
      localStorage.getItem(CENTERLINE_CUSTOM_NODE_KEY) || "{}"
    );
  } catch {
    centerlineCustomNodes = {};
    localStorage.removeItem(CENTERLINE_CUSTOM_NODE_KEY);
  }
}

function saveCenterlineOverrides() {
  localStorage.setItem(
    CENTERLINE_OVERRIDE_KEY,
    JSON.stringify(centerlineOverrides)
  );

  localStorage.setItem(
    CENTERLINE_DELETED_KEY,
    JSON.stringify([...centerlineDeletedNodes])
  );

  localStorage.setItem(
    CENTERLINE_BYPASS_KEY,
    JSON.stringify(centerlineBypasses)
  );

  localStorage.setItem(
    CENTERLINE_MERGE_KEY,
    JSON.stringify(centerlineMergedNodes)
  );

  localStorage.setItem(
    CENTERLINE_CUSTOM_NODE_KEY,
    JSON.stringify(centerlineCustomNodes)
  );
}

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

function lineCellsAreWalkable(a, b) {
  if (a.row !== b.row && a.col !== b.col) return false;

  const dr = Math.sign(b.row - a.row);
  const dc = Math.sign(b.col - a.col);
  let row = a.row;
  let col = a.col;

  while (true) {
    if (!isWalkable(row, col)) return false;
    if (row === b.row && col === b.col) return true;
    row += dr;
    col += dc;
  }
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

  for (const [sourceKey, rawTargetKey] of Object.entries(
    centerlineMergedNodes
  )) {
    const targetKey = resolveMergedCenterlineKey(rawTargetKey);
    const source = skeleton.cellByKey?.get(sourceKey);
    const target = skeleton.cellByKey?.get(targetKey);

    if (!source || !target || source.id === target.id) {
      continue;
    }

    /*
     * 원래 source 점에 연결된 모든 선을 target 점으로 옮긴다.
     */
    for (const link of [...source.links]) {
      const neighbor = cells[link.to];

      if (
        !neighbor ||
        neighbor.id === target.id ||
        isCenterlineNodeDeleted(neighbor)
      ) {
        continue;
      }

      const neighborLink = neighbor.links.find(
        (item) => item.to === source.id
      );

      neighbor.links = neighbor.links.filter(
        (item) => item.to !== source.id
      );

      if (!neighbor.links.some((item) => item.to === target.id)) {
        neighbor.links.push({
          ...(neighborLink || link),
          to: target.id,
          mergedFrom: source.id
        });
      }

      if (!target.links.some((item) => item.to === neighbor.id)) {
        target.links.push({
          ...link,
          to: neighbor.id,
          mergedFrom: source.id
        });
      }
    }

    target.links = target.links.filter(
      (link, index, list) =>
        link.to !== target.id &&
        list.findIndex((item) => item.to === link.to) === index
    );

    /*
     * 선의 양 끝점이 같은 노드로 병합되면 해당 선은 자동 삭제한다.
     */
    cleanupCollapsedCenterlineEdges(skeleton);

    source.links = [];
  }

  for (const cell of cells) {
    if (isCenterlineNodeMerged(cell)) {
      cell.links = [];
      continue;
    }

    cell.links = cell.links.filter((link) => {
      const target = cells[link.to];
      return target && !isCenterlineNodeMerged(target);
    });
  }

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
      to: second.id,
      cost,
      ...extra
    });
  }

  if (!second.links.some((link) => link.to === first.id)) {
    second.links.push({
      to: first.id,
      cost,
      ...extra
    });
  }
}

function cleanupCollapsedCenterlineEdges(skeleton) {
  if (!skeleton?.cells?.length) return skeleton;

  /*
   * 자기 자신으로 향하는 링크와 완전히 중복된 링크만 제거한다.
   *
   * 중요:
   * 선의 양 끝점이 병합되더라도 그 선 사이에 사용자가 추가한 중간 점은
   * 삭제하지 않는다. 중간 점은 독립 편집점으로 유지하고, 병합된 대표 노드와
   * 다시 연결해 기존 선의 형태와 세부 조정값을 보존한다.
   */
  for (const cell of skeleton.cells) {
    const seen = new Set();

    cell.links = cell.links.filter((link) => {
      if (link.to === cell.id) {
        return false;
      }

      const signature = [
        link.to,
        link.customSplit || "",
        link.manualBypass || "",
        link.mergedFrom || ""
      ].join(":");

      if (seen.has(signature)) {
        return false;
      }

      seen.add(signature);
      return true;
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

function customCenterlineNodeKey(cell) {
  return cell.isCustom
    ? cell.customKey
    : centerlineNodeKey(cell);
}

function addCenterlinePointOnEdge(event, first, second) {
  if (!centerlineEditMode) return;

  event.preventDefault();
  event.stopPropagation();

  const point = clientToSvg(
    event.clientX,
    event.clientY
  );

  const col = Math.floor(point.x / cellPx) + 1;
  const row = Math.floor(point.y / cellPx) + 1;

  if (!isWalkable(row, col)) {
    alert("복도 안에서만 점을 추가할 수 있습니다.");
    return;
  }

  const firstKey = customCenterlineNodeKey(first);
  const secondKey = customCenterlineNodeKey(second);

  /*
   * 이미 사용자 추가점으로 나뉜 선을 다시 클릭한 경우에도
   * 현재 클릭한 두 노드 사이를 다시 분할할 수 있다.
   */
  const id =
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);

  centerlineCustomNodes[id] = {
    from: firstKey,
    to: secondKey,
    x: point.x,
    y: point.y
  };

  centerlineOverrides[`CUSTOM:${id}`] = {
    x: point.x,
    y: point.y,
    explicitCorner: true
  };

  selectedCenterlineNodeKey = `CUSTOM:${id}`;
  saveCenterlineOverrides();

  centerlineSkeleton = applyCenterlineCustomNodes(
    applyCenterlineNodeMerges(
      applyCenterlineDeletedNodes(
        buildSingleCenterlineSkeleton()
      )
    )
  );

  renderCenterlineDebug();
  routeLine.setAttribute("points", "");
}

function findCenterlineMergeTarget(sourceCell) {
  if (!centerlineSkeleton?.cells?.length) return null;

  const sourcePoint = centerlinePoint(sourceCell);
  const threshold = Math.max(cellPx * 0.75, 6);

  let best = null;
  let bestDistance = Infinity;

  for (const cell of centerlineSkeleton.cells) {
    if (
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

    if (
      distance <= threshold &&
      distance < bestDistance
    ) {
      best = cell;
      bestDistance = distance;
    }
  }

  return best;
}

function mergeCenterlineNodes(sourceCell, targetCell) {
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

  if (sourceCell.isCustom && sourceCell.customId) {
    delete centerlineCustomNodes[sourceCell.customId];
  }

  selectedCenterlineNodeKey = targetKey;
  saveCenterlineOverrides();

  centerlineSkeleton = applyCenterlineCustomNodes(
    applyCenterlineNodeMerges(
      applyCenterlineDeletedNodes(
        buildSingleCenterlineSkeleton()
      )
    )
  );

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


function centerlineSegmentWalkableByPoints(first, second) {
  const a = centerlinePoint(first);
  const b = centerlinePoint(second);

  if (a.x !== b.x && a.y !== b.y) return false;

  const distance =
    Math.abs(b.x - a.x) +
    Math.abs(b.y - a.y);

  const steps = Math.max(
    1,
    Math.ceil(distance / Math.max(1, cellPx * 0.25))
  );

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const col = Math.floor(x / cellPx) + 1;
    const row = Math.floor(y / cellPx) + 1;

    if (!isWalkable(row, col)) return false;
  }

  return true;
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

function findFlexibleDeletionConnection(first, second, deletedCell) {
  const a = centerlinePoint(first);
  const b = centerlinePoint(second);
  const deleted = centerlinePoint(deletedCell);

  const candidates = [];

  /*
   * 1순위: 1과 3을 직접 한 선으로 연결.
   * 두 점 사이의 모든 샘플이 복도 안이면 대각선도 허용한다.
   */
  if (centerlineRawSegmentWalkable(a, b)) {
    candidates.push({
      first,
      second,
      mode: "direct",
      viaPoint: null,
      length: Math.hypot(b.x - a.x, b.y - a.y),
      bends: 0
    });
  }

  /*
   * 2순위: 직각 한 번으로 연결하는 두 후보.
   */
  const corners = [
    { x: a.x, y: b.y },
    { x: b.x, y: a.y }
  ];

  for (const corner of corners) {
    if (
      !centerlineRawPointWalkable(corner) ||
      !centerlineRawSegmentWalkable(a, corner) ||
      !centerlineRawSegmentWalkable(corner, b)
    ) {
      continue;
    }

    candidates.push({
      first,
      second,
      mode: "orthogonal",
      viaPoint: corner,
      length:
        Math.abs(corner.x - a.x) +
        Math.abs(corner.y - a.y) +
        Math.abs(b.x - corner.x) +
        Math.abs(b.y - corner.y),
      bends: 1,
      deletedDistance:
        Math.hypot(corner.x - deleted.x, corner.y - deleted.y)
    });
  }

  candidates.sort((left, right) => {
    if (left.bends !== right.bends) {
      return left.bends - right.bends;
    }

    if (left.length !== right.length) {
      return left.length - right.length;
    }

    return (
      (left.deletedDistance || 0) -
      (right.deletedDistance || 0)
    );
  });

  return candidates[0] || null;
}

function graphRemainsConnectedAfterDeletion(
  skeleton,
  deletedCell,
  bypassPair
) {
  const activeCells = skeleton.cells.filter(
    (cell) =>
      !isCenterlineNodeDeleted(cell) &&
      cell.id !== deletedCell.id
  );

  if (!activeCells.length) return true;

  const adjacency = new Map();

  for (const cell of activeCells) {
    adjacency.set(cell.id, new Set());
  }

  for (const cell of activeCells) {
    for (const link of cell.links) {
      const target = skeleton.cells[link.to];

      if (
        !target ||
        target.id === deletedCell.id ||
        isCenterlineNodeDeleted(target) ||
        !adjacency.has(target.id)
      ) {
        continue;
      }

      adjacency.get(cell.id).add(target.id);
    }
  }

  if (bypassPair) {
    adjacency.get(bypassPair.first.id)?.add(
      bypassPair.second.id
    );
    adjacency.get(bypassPair.second.id)?.add(
      bypassPair.first.id
    );
  }

  const startId = activeCells[0].id;
  const visited = new Set([startId]);
  const queue = [startId];

  for (let head = 0; head < queue.length; head++) {
    const currentId = queue[head];

    for (const nextId of adjacency.get(currentId) || []) {
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      queue.push(nextId);
    }
  }

  return visited.size === activeCells.length;
}

function findBestDeletionBypass(cell, neighbors) {
  const candidates = [];

  for (let i = 0; i < neighbors.length; i++) {
    for (let j = i + 1; j < neighbors.length; j++) {
      const first = neighbors[i];
      const second = neighbors[j];

      const firstPoint = centerlinePoint(first);
      const secondPoint = centerlinePoint(second);

      const straight =
        firstPoint.x === secondPoint.x ||
        firstPoint.y === secondPoint.y;

      if (
        !straight ||
        !centerlineSegmentWalkableByPoints(first, second)
      ) {
        continue;
      }

      const span =
        Math.abs(firstPoint.x - secondPoint.x) +
        Math.abs(firstPoint.y - secondPoint.y);

      /*
       * 선택점 기준으로 서로 반대 방향에 있는 쌍을 우선한다.
       * 예: 위-선택점-아래 또는 왼쪽-선택점-오른쪽.
       */
      const cellPoint = centerlinePoint(cell);

      const oppositeVertical =
        firstPoint.x === cellPoint.x &&
        secondPoint.x === cellPoint.x &&
        (
          (firstPoint.y < cellPoint.y &&
            secondPoint.y > cellPoint.y) ||
          (secondPoint.y < cellPoint.y &&
            firstPoint.y > cellPoint.y)
        );

      const oppositeHorizontal =
        firstPoint.y === cellPoint.y &&
        secondPoint.y === cellPoint.y &&
        (
          (firstPoint.x < cellPoint.x &&
            secondPoint.x > cellPoint.x) ||
          (secondPoint.x < cellPoint.x &&
            firstPoint.x > cellPoint.x)
        );

      candidates.push({
        first,
        second,
        span,
        opposite:
          oppositeVertical || oppositeHorizontal
            ? 1
            : 0
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.opposite !== b.opposite) {
      return b.opposite - a.opposite;
    }

    return b.span - a.span;
  });

  return candidates[0] || null;
}

function deleteSelectedCenterlineNode() {
  if (!selectedCenterlineNodeKey || !centerlineSkeleton) {
    return;
  }

  const cell = centerlineSkeleton.cellByKey?.get(
    selectedCenterlineNodeKey
  );

  if (!cell) return;

  if (cell.isAutoIntermediate) {
    const neighbors = cell.links
      .map((link) => centerlineSkeleton.cells[link.to])
      .filter(Boolean);

    if (neighbors.length === 2) {
      const first = neighbors[0];
      const second = neighbors[1];

      removeLinkBetween(first, cell);
      removeLinkBetween(cell, second);

      const a = centerlinePoint(first);
      const b = centerlinePoint(second);

      addBidirectionalCenterlineLink(
        first,
        second,
        Math.hypot(b.x - a.x, b.y - a.y) / cellPx,
        { restoredAfterAutoDelete: true }
      );
    }

    centerlineDeletedNodes.add(cell.autoKey);
    delete centerlineOverrides[cell.autoKey];
    selectedCenterlineNodeKey = null;
    saveCenterlineOverrides();

    centerlineSkeleton = normalizeCenterlineGraph(
      applyCenterlineDeletedNodes(
        buildSingleCenterlineSkeleton()
      )
    );

    renderCenterlineDebug();
    routeLine.setAttribute("points", "");
    return;
  }

  if (cell.isCustom && cell.customId) {
    const activeNeighbors = cell.links
      .map((link) => centerlineSkeleton.cells[link.to])
      .filter(Boolean);

    if (activeNeighbors.length === 2) {
      const first = activeNeighbors[0];
      const second = activeNeighbors[1];
      const firstPoint = centerlinePoint(first);
      const secondPoint = centerlinePoint(second);

      removeLinkBetween(first, cell);
      removeLinkBetween(cell, second);

      const cost =
        Math.hypot(
          secondPoint.x - firstPoint.x,
          secondPoint.y - firstPoint.y
        ) / cellPx;

      addBidirectionalCenterlineLink(
        first,
        second,
        cost,
        { restoredAfterCustomDelete: true }
      );
    }

    delete centerlineCustomNodes[cell.customId];
    delete centerlineOverrides[cell.customKey];
    selectedCenterlineNodeKey = null;
    saveCenterlineOverrides();

    centerlineSkeleton = applyCenterlineCustomNodes(
      applyCenterlineNodeMerges(
        applyCenterlineDeletedNodes(
          buildSingleCenterlineSkeleton()
        )
      )
    );

    renderCenterlineDebug();
    routeLine.setAttribute("points", "");
    return;
  }

  const activeNeighbors = cell.links
    .map((link) => centerlineSkeleton.cells[link.to])
    .filter(
      (target) =>
        target &&
        !isCenterlineNodeDeleted(target)
    );

  if (activeNeighbors.length < 2) {
    alert("연결된 점이 부족해 삭제할 수 없습니다.");
    return;
  }

  /*
   * 1과 3이 같은 행/열이 아니어도:
   * - 복도 안에서 직접 연결 가능하면 한 선으로 연결
   * - 직접 연결이 안 되면 한 번 꺾는 안전한 직각선으로 연결
   */
  const candidates = [];

  for (let i = 0; i < activeNeighbors.length; i++) {
    for (let j = i + 1; j < activeNeighbors.length; j++) {
      const connection = findFlexibleDeletionConnection(
        activeNeighbors[i],
        activeNeighbors[j],
        cell
      );

      if (!connection) continue;

      if (
        graphRemainsConnectedAfterDeletion(
          centerlineSkeleton,
          cell,
          connection
        )
      ) {
        candidates.push(connection);
      }
    }
  }

  const connectedWithoutBypass =
    graphRemainsConnectedAfterDeletion(
      centerlineSkeleton,
      cell,
      null
    );

  candidates.sort((a, b) => {
    if (a.bends !== b.bends) {
      return a.bends - b.bends;
    }

    return a.length - b.length;
  });

  const chosen = candidates[0] || null;

  if (!chosen && !connectedWithoutBypass) {
    alert(
      "이 점을 삭제하면 중앙선이 실제로 끊기거나, " +
      "1과 3을 복도 안에서 안전하게 연결할 수 없습니다."
    );
    return;
  }

  if (chosen) {
    centerlineBypasses[selectedCenterlineNodeKey] = {
      from: centerlineNodeKey(chosen.first),
      to: centerlineNodeKey(chosen.second),
      viaPoint: chosen.viaPoint
    };
  } else {
    delete centerlineBypasses[selectedCenterlineNodeKey];
  }

  centerlineDeletedNodes.add(selectedCenterlineNodeKey);
  delete centerlineOverrides[selectedCenterlineNodeKey];

  selectedCenterlineNodeKey = null;
  saveCenterlineOverrides();

  centerlineSkeleton = applyCenterlineCustomNodes(
    applyCenterlineNodeMerges(
      applyCenterlineDeletedNodes(
        buildSingleCenterlineSkeleton()
      )
    )
  );

  renderCenterlineDebug();
  routeLine.setAttribute("points", "");
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
   * - 꺾임점: 연결선은 2개지만 두 선이 같은 직선이 아님
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

function isExplicitCenterlineCorner(cell) {
  const key = centerlineNodeKey(cell);
  const override = centerlineOverrides[key];

  if (override?.forcedIntermediate) {
    return false;
  }

  return !!(
    cell.isCustom ||
    override?.explicitCorner
  );
}

function markCenterlineCorner(cell, enabled = true) {
  const key = centerlineNodeKey(cell);
  const point = centerlinePoint(cell);

  centerlineOverrides[key] = {
    ...(centerlineOverrides[key] || {}),
    x: point.x,
    y: point.y,
    explicitCorner: enabled
  };
}

function straightenNonCornerNodes(skeleton) {
  if (!skeleton?.cells?.length) return skeleton;

  const cells = skeleton.cells;
  const EPSILON = Math.max(0.5, cellPx * 0.08);

  /*
   * 연결선이 정확히 2개인 점은 기본적으로 중간점이다.
   * 명시적 꼭지점이 아니라면 두 이웃 사이의 직선 위로 이동시킨다.
   */
  for (const cell of cells) {
    if (
      isCenterlineNodeDeleted(cell) ||
      isCenterlineNodeMerged(cell) ||
      cell.hiddenByCleanup
    ) {
      continue;
    }

    const neighbors = activeCenterlineNeighbors(
      cell,
      skeleton
    );

    if (
      neighbors.length !== 2 ||
      isExplicitCenterlineCorner(cell)
    ) {
      continue;
    }

    const first = centerlinePoint(neighbors[0]);
    const second = centerlinePoint(neighbors[1]);
    const current = centerlinePoint(cell);

    const horizontal =
      Math.abs(first.y - second.y) <= EPSILON;

    const vertical =
      Math.abs(first.x - second.x) <= EPSILON;

    if (horizontal) {
      centerlineOverrides[centerlineNodeKey(cell)] = {
        ...(centerlineOverrides[centerlineNodeKey(cell)] || {}),
        x: Math.min(
          Math.max(current.x, Math.min(first.x, second.x)),
          Math.max(first.x, second.x)
        ),
        y: (first.y + second.y) / 2,
        explicitCorner: false
      };
      continue;
    }

    if (vertical) {
      centerlineOverrides[centerlineNodeKey(cell)] = {
        ...(centerlineOverrides[centerlineNodeKey(cell)] || {}),
        x: (first.x + second.x) / 2,
        y: Math.min(
          Math.max(current.y, Math.min(first.y, second.y)),
          Math.max(first.y, second.y)
        ),
        explicitCorner: false
      };
      continue;
    }

    /*
     * 이웃이 서로 직각 관계인데 현재 점이 꼭지점으로 지정되지 않았다면,
     * 복도 안에서 가능한 두 직각 후보 중 이동량이 작은 위치로 정렬한다.
     */
    const candidates = [
      { x: first.x, y: second.y },
      { x: second.x, y: first.y }
    ].filter((point) => {
      const col = Math.floor(point.x / cellPx) + 1;
      const row = Math.floor(point.y / cellPx) + 1;
      return isWalkable(row, col);
    });

    if (!candidates.length) continue;

    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - current.x, a.y - current.y) -
        Math.hypot(b.x - current.x, b.y - current.y)
    );

    centerlineOverrides[centerlineNodeKey(cell)] = {
      ...(centerlineOverrides[centerlineNodeKey(cell)] || {}),
      x: candidates[0].x,
      y: candidates[0].y,
      explicitCorner: false
    };
  }

  return skeleton;
}

function ensureAutomaticIntermediatePoints(skeleton) {
  if (!skeleton?.cells?.length) return skeleton;

  const cells = skeleton.cells;
  const processed = new Set();
  const edges = [];

  for (const cell of [...cells]) {
    for (const link of [...cell.links]) {
      const target = cells[link.to];

      if (
        !target ||
        target.id === cell.id ||
        isCenterlineNodeDeleted(cell) ||
        isCenterlineNodeDeleted(target) ||
        isCenterlineNodeMerged(cell) ||
        isCenterlineNodeMerged(target) ||
        cell.hiddenByCleanup ||
        target.hiddenByCleanup ||
        link.via ||
        link.viaPoint
      ) {
        continue;
      }

      const pair = [
        Math.min(cell.id, target.id),
        Math.max(cell.id, target.id)
      ].join(":");

      if (processed.has(pair)) continue;
      processed.add(pair);

      const first = centerlinePoint(cell);
      const second = centerlinePoint(target);

      const horizontal =
        Math.abs(first.y - second.y) < 0.01;
      const vertical =
        Math.abs(first.x - second.x) < 0.01;

      if (!horizontal && !vertical) continue;

      const distance = horizontal
        ? Math.abs(second.x - first.x)
        : Math.abs(second.y - first.y);

      if (distance <= cellPx * 1.5) continue;

      edges.push({
        firstCell: cell,
        secondCell: target,
        first,
        second,
        distance
      });
    }
  }

  for (const edge of edges) {
    const {
      firstCell,
      secondCell,
      first,
      second,
      distance
    } = edge;

    removeLinkBetween(firstCell, secondCell);

    const segmentCount = Math.max(
      2,
      Math.round(distance / cellPx)
    );

    const stableKey = [
      centerlineNodeKey(firstCell),
      centerlineNodeKey(secondCell)
    ].sort().join("|");

    const chain = [firstCell];

    for (let index = 1; index < segmentCount; index++) {
      const ratio = index / segmentCount;
      const x = first.x + (second.x - first.x) * ratio;
      const y = first.y + (second.y - first.y) * ratio;
      const autoKey =
        `AUTO:${stableKey}:${index}/${segmentCount}`;

      if (centerlineDeletedNodes.has(autoKey)) {
        continue;
      }

      const node = {
        id: skeleton.cells.length,
        row: y / cellPx + 0.5,
        col: x / cellPx + 0.5,
        links: [],
        autoKey,
        isAutoIntermediate: true
      };

      skeleton.cells.push(node);
      skeleton.cellByKey.set(autoKey, node);
      chain.push(node);
    }

    chain.push(secondCell);

    for (let index = 1; index < chain.length; index++) {
      const previous = chain[index - 1];
      const current = chain[index];
      const a = centerlinePoint(previous);
      const b = centerlinePoint(current);

      addBidirectionalCenterlineLink(
        previous,
        current,
        Math.hypot(b.x - a.x, b.y - a.y) / cellPx,
        {
          autoIntermediate: true,
          autoEdge: stableKey
        }
      );
    }
  }

  return skeleton;
}

function normalizeCenterlineGraph(skeleton) {
  return rebalanceAllStraightIntermediateChains(
    ensureAutomaticIntermediatePoints(
      straightenNonCornerNodes(skeleton)
    )
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

function ensureCenterlineConnectivityStatus() {
  if (!isAdminScreen()) return null;

  const toolbar = document.querySelector(".map-actions");
  if (!toolbar) return null;

  let status = document.querySelector(
    "#centerlineConnectivityStatus"
  );

  if (!status) {
    status = document.createElement("button");
    status.id = "centerlineConnectivityStatus";
    status.type = "button";
    status.title =
      "동선 노드 연결 상태를 확인합니다.";

    status.addEventListener("click", () => {
      if (!centerlineDisconnectedComponents.length) {
        alert("모든 동선 노드가 하나로 연결되어 있습니다.");
        return;
      }

      const componentSizes =
        centerlineDisconnectedComponents
          .map(
            (component, index) =>
              `${index + 1}번 분리 구간: 노드 ${component.length}개`
          )
          .join("\n");

      alert(
        `연결되지 않은 동선 구간이 ` +
        `${centerlineDisconnectedComponents.length}개 있습니다.\n\n` +
        componentSizes +
        "\n\n지도에서 자주색 점선과 주황색 점으로 표시됩니다."
      );
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
    status.textContent = `연결 이상 ${count}`;
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



function isStraightIntermediateNode(cell, skeleton) {
  if (!cell || !skeleton) return false;

  const neighbors = activeCenterlineNeighbors(
    cell,
    skeleton
  );

  if (neighbors.length !== 2) return false;

  const key = centerlineNodeKey(cell);

  return !!(
    cell.isAutoIntermediate ||
    centerlineOverrides[key]?.forcedIntermediate ||
    (
      !isExplicitCenterlineCorner(cell) &&
      !isCenterlineKeyNode(cell, skeleton.cells)
    )
  );
}


function getStraightAxisForNode(cell, skeleton) {
  const neighbors = activeCenterlineNeighbors(cell, skeleton);

  if (neighbors.length !== 2) {
    return null;
  }

  const first = centerlinePoint(neighbors[0]);
  const second = centerlinePoint(neighbors[1]);
  const EPSILON = Math.max(0.5, cellPx * 0.08);

  if (Math.abs(first.y - second.y) <= EPSILON) {
    return "horizontal";
  }

  if (Math.abs(first.x - second.x) <= EPSILON) {
    return "vertical";
  }

  return null;
}

function isAnchorCenterlineNode(cell, skeleton) {
  return !isStraightIntermediateNode(cell, skeleton);
}

function findDirectionalStraightNeighbor(
  cell,
  previous,
  axis,
  direction,
  skeleton
) {
  const current = centerlinePoint(cell);
  const neighbors = activeCenterlineNeighbors(cell, skeleton)
    .filter((item) => !previous || item.id !== previous.id);

  const EPSILON = Math.max(0.5, cellPx * 0.08);

  const candidates = neighbors.filter((item) => {
    const point = centerlinePoint(item);

    if (axis === "horizontal") {
      if (Math.abs(point.y - current.y) > EPSILON) {
        return false;
      }

      return direction < 0
        ? point.x < current.x - EPSILON
        : point.x > current.x + EPSILON;
    }

    if (Math.abs(point.x - current.x) > EPSILON) {
      return false;
    }

    return direction < 0
      ? point.y < current.y - EPSILON
      : point.y > current.y + EPSILON;
  });

  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => {
    const pointA = centerlinePoint(a);
    const pointB = centerlinePoint(b);

    if (axis === "horizontal") {
      return direction < 0
        ? pointB.x - pointA.x
        : pointA.x - pointB.x;
    }

    return direction < 0
      ? pointB.y - pointA.y
      : pointA.y - pointB.y;
  });

  return candidates[0];
}

function collectStraightIntermediateChain(
  startCell,
  skeleton
) {
  /*
   * 중간점 재배치는 "직선 한 구간" 단위로만 수행한다.
   * 즉, 교점~교점 / 교점~끝점 사이를 하나의 구간으로 보고
   * 그 내부의 중간점만 같은 간격으로 재배치한다.
   */
  const axis = getStraightAxisForNode(
    startCell,
    skeleton
  );

  if (!axis) {
    return [startCell];
  }

  const origin = centerlinePoint(startCell);
  const neighbors = activeCenterlineNeighbors(
    startCell,
    skeleton
  );

  if (neighbors.length !== 2) {
    return [startCell];
  }

  const negativeNeighbor = neighbors.find((cell) => {
    const point = centerlinePoint(cell);
    return axis === "horizontal"
      ? point.x < origin.x
      : point.y < origin.y;
  });

  const positiveNeighbor = neighbors.find((cell) => {
    const point = centerlinePoint(cell);
    return axis === "horizontal"
      ? point.x > origin.x
      : point.y > origin.y;
  });

  function walk(initialNeighbor, direction) {
    const result = [];
    let previous = startCell;
    let current = initialNeighbor;

    while (current) {
      result.push(current);

      if (isAnchorCenterlineNode(current, skeleton)) {
        break;
      }

      const next = findDirectionalStraightNeighbor(
        current,
        previous,
        axis,
        direction,
        skeleton
      );

      previous = current;
      current = next;
    }

    return result;
  }

  const negativeChain = negativeNeighbor
    ? walk(negativeNeighbor, -1).reverse()
    : [];

  const positiveChain = positiveNeighbor
    ? walk(positiveNeighbor, 1)
    : [];

  return [
    ...negativeChain,
    startCell,
    ...positiveChain
  ];
}

function redistributeIntermediateChainEvenly(
  selectedCell,
  skeleton
) {
  const chain = collectStraightIntermediateChain(
    selectedCell,
    skeleton
  );

  if (chain.length < 3) return false;

  const firstCell = chain[0];
  const lastCell = chain[chain.length - 1];
  const first = centerlinePoint(firstCell);
  const last = centerlinePoint(lastCell);
  const EPSILON = Math.max(0.5, cellPx * 0.08);

  const horizontal =
    Math.abs(first.y - last.y) <= EPSILON;

  const vertical =
    Math.abs(first.x - last.x) <= EPSILON;

  if (
    !horizontal && !vertical ||
    !isAnchorCenterlineNode(firstCell, skeleton) ||
    !isAnchorCenterlineNode(lastCell, skeleton)
  ) {
    return false;
  }

  const interior = chain.slice(1, -1)
    .filter((item) =>
      isStraightIntermediateNode(item, skeleton)
    );

  if (!interior.length) return false;

  const denominator = interior.length + 1;

  interior.forEach((cell, index) => {
    const ratio = (index + 1) / denominator;
    const key = centerlineNodeKey(cell);

    const x = first.x + (last.x - first.x) * ratio;
    const y = first.y + (last.y - first.y) * ratio;

    centerlineOverrides[key] = {
      ...(centerlineOverrides[key] || {}),
      x,
      y,
      explicitCorner: false,
      forcedIntermediate: true
    };

    if (cell.isCustom && cell.customId) {
      const item = centerlineCustomNodes[cell.customId];

      if (item) {
        item.x = x;
        item.y = y;
        item.explicitCorner = false;
      }
    }
  });

  return true;
}

function rebalanceAllStraightIntermediateChains(skeleton) {
  if (!skeleton?.cells?.length) return skeleton;

  const processed = new Set();

  for (const cell of skeleton.cells) {
    if (
      !isStraightIntermediateNode(cell, skeleton) ||
      processed.has(cell.id)
    ) {
      continue;
    }

    const chain = collectStraightIntermediateChain(
      cell,
      skeleton
    );

    /*
     * 처리 완료 표시:
     * - 같은 직선 구간을 중복 재배치하지 않도록
     * - 특히 교점이 경계(anchor)로 유지되도록
     */
    for (const chainCell of chain) {
      if (isStraightIntermediateNode(chainCell, skeleton)) {
        processed.add(chainCell.id);
      }
    }

    if (chain.length < 3) continue;

    const firstCell = chain[0];
    const lastCell = chain[chain.length - 1];
    const first = centerlinePoint(firstCell);
    const last = centerlinePoint(lastCell);
    const EPSILON = Math.max(0.5, cellPx * 0.08);

    const horizontal =
      Math.abs(first.y - last.y) <= EPSILON;

    const vertical =
      Math.abs(first.x - last.x) <= EPSILON;

    /*
     * 양 끝은 반드시 anchor(교점/꺾임점/끝점)여야 한다.
     * 그렇지 않으면 이 구간은 건드리지 않는다.
     */
    if (
      !horizontal && !vertical ||
      !isAnchorCenterlineNode(firstCell, skeleton) ||
      !isAnchorCenterlineNode(lastCell, skeleton)
    ) {
      continue;
    }

    const interior = chain.slice(1, -1)
      .filter((item) =>
        isStraightIntermediateNode(item, skeleton)
      );

    if (!interior.length) continue;

    const denominator = interior.length + 1;

    interior.forEach((chainCell, index) => {
      const key = centerlineNodeKey(chainCell);
      const ratio = (index + 1) / denominator;
      const x = first.x + (last.x - first.x) * ratio;
      const y = first.y + (last.y - first.y) * ratio;

      centerlineOverrides[key] = {
        ...(centerlineOverrides[key] || {}),
        x,
        y,
        explicitCorner: false,
        forcedIntermediate: true
      };

      if (chainCell.isCustom && chainCell.customId) {
        const item = centerlineCustomNodes[chainCell.customId];

        if (item) {
          item.x = x;
          item.y = y;
          item.explicitCorner = false;
        }
      }
    });
  }

  return skeleton;
}

function convertSelectedNodeToIntermediate() {
  if (
    !selectedCenterlineNodeKey ||
    !centerlineSkeleton
  ) {
    alert("중간점으로 바꿀 빨간 점을 먼저 선택하세요.");
    return;
  }

  const cell = centerlineSkeleton.cellByKey?.get(
    selectedCenterlineNodeKey
  );

  if (!cell) {
    alert("선택한 점을 찾지 못했습니다.");
    return;
  }

  const neighbors = activeCenterlineNeighbors(
    cell,
    centerlineSkeleton
  );

  if (neighbors.length !== 2) {
    alert(
      "연결선이 정확히 2개인 점만 중간점으로 변경할 수 있습니다. " +
      "끝점이나 교차점은 먼저 연결 구조를 정리해 주세요."
    );
    return;
  }

  const first = centerlinePoint(neighbors[0]);
  const second = centerlinePoint(neighbors[1]);
  const current = centerlinePoint(cell);
  const EPSILON = Math.max(0.5, cellPx * 0.08);

  const horizontal =
    Math.abs(first.y - second.y) <= EPSILON;

  const vertical =
    Math.abs(first.x - second.x) <= EPSILON;

  let x = current.x;
  let y = current.y;

  if (horizontal) {
    x = Math.min(
      Math.max(current.x, Math.min(first.x, second.x)),
      Math.max(first.x, second.x)
    );
    y = (first.y + second.y) / 2;
  } else if (vertical) {
    x = (first.x + second.x) / 2;
    y = Math.min(
      Math.max(current.y, Math.min(first.y, second.y)),
      Math.max(first.y, second.y)
    );
  } else {
    const candidates = [
      { x: first.x, y: second.y },
      { x: second.x, y: first.y }
    ].filter((point) => {
      const col = Math.floor(point.x / cellPx) + 1;
      const row = Math.floor(point.y / cellPx) + 1;
      return isWalkable(row, col);
    });

    if (!candidates.length) {
      alert(
        "이 점은 직선 중간점으로 자동 정렬할 수 없습니다. " +
        "양쪽 선을 먼저 같은 가로선 또는 세로선에 맞춰 주세요."
      );
      return;
    }

    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - current.x, a.y - current.y) -
        Math.hypot(b.x - current.x, b.y - current.y)
    );

    x = candidates[0].x;
    y = candidates[0].y;
  }

  centerlineOverrides[selectedCenterlineNodeKey] = {
    ...(centerlineOverrides[selectedCenterlineNodeKey] || {}),
    x,
    y,
    explicitCorner: false,
    forcedIntermediate: true
  };

  if (cell.isCustom && cell.customId) {
    const item = centerlineCustomNodes[cell.customId];

    if (item) {
      item.x = x;
      item.y = y;
      item.explicitCorner = false;
    }
  }

  /*
   * 새 중간점을 포함한 동일 직선 구간 전체를
   * 양 끝점 사이에서 같은 간격으로 자동 재배치한다.
   */
  redistributeIntermediateChainEvenly(
    cell,
    centerlineSkeleton
  );

  saveCenterlineOverrides();

  centerlineSkeleton = rebalanceAllStraightIntermediateChains(
    normalizeCenterlineGraph(
      applyCenterlineDeletedNodes(
        buildSingleCenterlineSkeleton()
      )
    )
  );

  saveCenterlineOverrides();
  renderCenterlineDebug();
  routeLine.setAttribute("points", "");
}

function ensureCenterlineEditorControls() {
  if (!isAdminScreen()) return;

  const toolbar = document.querySelector(".map-actions");
  if (!toolbar || document.querySelector("#centerlineEditBtn")) return;

  const editButton = document.createElement("button");
  editButton.id = "centerlineEditBtn";
  editButton.type = "button";
  editButton.textContent = "중앙선 편집";
  editButton.title = "중앙선 꺾임점과 교차점을 마우스로 이동";

  const deleteButton = document.createElement("button");
  deleteButton.id = "centerlineDeleteNodeBtn";
  deleteButton.type = "button";
  deleteButton.textContent = "선택점 삭제";
  deleteButton.title = "1-2-3에서 선택한 2번 점을 삭제하고 1-3을 직선 연결";

  const intermediateButton = document.createElement("button");
  intermediateButton.id = "centerlineToIntermediateBtn";
  intermediateButton.type = "button";
  intermediateButton.textContent = "중간점 전환";
  intermediateButton.title =
    "선택한 빨간 점을 직선 중간점으로 변경";

  const resetButton = document.createElement("button");
  resetButton.id = "centerlineEditResetBtn";
  resetButton.type = "button";
  resetButton.textContent = "편집 초기화";
  resetButton.title = "수동 이동 및 삭제 내역을 모두 초기화";

  editButton.addEventListener("click", () => {
    centerlineEditMode = !centerlineEditMode;
    selectedCenterlineNodeKey = null;

    editButton.classList.toggle(
      "active",
      centerlineEditMode
    );

    floorMap.classList.toggle(
      "centerline-edit-mode",
      centerlineEditMode
    );

    centerlineDebugVisible = centerlineEditMode;
    renderCenterlineDebug();
  });

  deleteButton.addEventListener(
    "click",
    deleteSelectedCenterlineNode
  );

  intermediateButton.addEventListener(
    "click",
    convertSelectedNodeToIntermediate
  );

  resetButton.addEventListener("click", () => {
    centerlineOverrides = {};
    centerlineDeletedNodes = new Set();
    centerlineBypasses = {};
    centerlineMergedNodes = {};
    centerlineCustomNodes = {};
    selectedCenterlineNodeKey = null;
    saveCenterlineOverrides();

    centerlineSkeleton = applyCenterlineDeletedNodes(
      buildSingleCenterlineSkeleton()
    );

    renderCenterlineDebug();
    routeLine.setAttribute("points", "");
  });

  toolbar.prepend(resetButton);
  toolbar.prepend(intermediateButton);
  toolbar.prepend(deleteButton);
  toolbar.prepend(editButton);
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

  centerlineDrag = {
    pointerId: event.pointerId,
    cell,
    neighbors,
    startPointer: point,
    startPoint: centerlinePoint(cell)
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

    const magnetDistance = cellPx * 1.6;
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

    if (bestXDistance <= magnetDistance) x = bestX;
    if (bestYDistance <= magnetDistance) y = bestY;

    /*
     * 양쪽 이웃이 이미 같은 수직선/수평선에 있으면
     * 선택점을 그 직선 위에 강하게 고정한다.
     */
    if (neighborPoints.length === 2) {
      if (neighborPoints[0].x === neighborPoints[1].x) {
        x = neighborPoints[0].x;
      }

      if (neighborPoints[0].y === neighborPoints[1].y) {
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
    explicitCorner:
      fineMove ||
      centerlineDrag.cell.isCustom ||
      false
  };

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

  const sourceCell = centerlineDrag.cell;
  saveCenterlineOverrides();
  centerlineDrag = null;

  const targetCell = findCenterlineMergeTarget(sourceCell);

  if (targetCell) {
    const shouldMerge = confirm(
      "두 중앙선 점이 겹쳤습니다.\n\n" +
      "두 점을 하나로 합치시겠습니까?\n" +
      "합치면 두 점이 가지고 있던 모든 선이 하나의 점에 연결됩니다."
    );

    if (shouldMerge) {
      mergeCenterlineNodes(
        sourceCell,
        targetCell
      );
      return true;
    }
  }

  renderCenterlineDebug();
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

  centerlineSkeleton = applyCenterlineCustomNodes(
    applyCenterlineNodeMerges(
      applyCenterlineDeletedNodes(
        buildSingleCenterlineSkeleton()
      )
    )
  );

  const cells = centerlineSkeleton?.cells || [];
  updateCenterlineConnectivityStatus(centerlineSkeleton);
  const drawn = new Set();

  for (const cell of cells) {
    if (
      isCenterlineNodeDeleted(cell) ||
      isCenterlineNodeMerged(cell)
    ) continue;

    const from = centerlinePoint(cell);

    for (const link of cell.links) {
      const target = cells[link.to];

      if (
        !target ||
        isCenterlineNodeDeleted(target) ||
        isCenterlineNodeMerged(target)
      ) {
        continue;
      }

      const pair = [
        Math.min(cell.id, target.id),
        Math.max(cell.id, target.id)
      ].join(":");

      if (drawn.has(pair)) continue;
      drawn.add(pair);

      const points = [from];

      if (link.viaPoint) {
        points.push({
          x: link.viaPoint.x,
          y: link.viaPoint.y
        });
      } else if (link.via) {
        points.push(
          gridPoint(link.via.row, link.via.col)
        );
      }

      points.push(centerlinePoint(target));

      const disconnectedEdge =
        centerlineDisconnectedNodeIds.has(cell.id) ||
        centerlineDisconnectedNodeIds.has(target.id);

      centerlineDebugLayer.appendChild(
        svgEl("polyline", {
          points: points
            .map((point) => `${point.x},${point.y}`)
            .join(" "),
          fill: "none",
          stroke: disconnectedEdge
            ? "#a855f7"
            : "#2563eb",
          "stroke-width": Math.max(
            disconnectedEdge ? 1.6 : 1.2,
            cellPx * (disconnectedEdge ? 0.28 : 0.22)
          ),
          "stroke-dasharray": disconnectedEdge
            ? `${Math.max(3, cellPx * 0.7)} ${Math.max(2, cellPx * 0.4)}`
            : "none",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          opacity: disconnectedEdge ? "1" : "0.88",
          "pointer-events": centerlineEditMode
            ? "stroke"
            : "none",
          cursor: centerlineEditMode
            ? "crosshair"
            : "default",
          "data-centerline-edge": pair,
          "data-disconnected-edge": disconnectedEdge
            ? "true"
            : "false"
        })
      );

      const edgeElement =
        centerlineDebugLayer.lastElementChild;

      if (centerlineEditMode && edgeElement) {
        edgeElement.addEventListener(
          "click",
          (event) =>
            addCenterlinePointOnEdge(
              event,
              cell,
              target
            )
        );
      }
    }
  }

  if (centerlineEditMode) {
    for (const cell of cells) {
      if (
        isCenterlineNodeDeleted(cell) ||
        isCenterlineNodeMerged(cell)
      ) {
        continue;
      }

      const point = centerlinePoint(cell);
      const key = centerlineNodeKey(cell);
      const selected =
        key === selectedCenterlineNodeKey;

      /*
       * 기존에는 교차점·꺾임점만 핸들로 표시해
       * 직선 중간의 degree-2 노드가 사라진 것처럼 보였다.
       *
       * 이제 모든 살아 있는 노드를 표시한다.
       * - 교차점·꺾임점·마무리점: 큰 진한 원
       * - 직선 위의 중간점: 작고 연한 하늘색 원
       */
      const forcedIntermediate =
        !!centerlineOverrides[key]?.forcedIntermediate;

      const keyNode =
        forcedIntermediate ||
        cell.isAutoIntermediate
          ? false
          : isCenterlineKeyNode(cell, cells);

      const handleRadius = selected
        ? Math.max(4.2, cellPx * 0.52)
        : keyNode
          ? Math.max(3.3, cellPx * 0.43)
          : Math.max(2.0, cellPx * 0.24);

      const disconnectedNode =
        centerlineDisconnectedNodeIds.has(cell.id);

      const handle = svgEl("circle", {
        cx: point.x,
        cy: point.y,
        r: disconnectedNode
          ? Math.max(handleRadius, cellPx * 0.36)
          : handleRadius,

        fill: selected
          ? "#fef08a"
          : disconnectedNode
            ? "#ffedd5"
            : keyNode
              ? "#ffffff"
              : "#e0f2fe",

        stroke: selected
          ? "#b91c1c"
          : disconnectedNode
            ? "#f97316"
            : keyNode
              ? "#dc2626"
              : "#7dd3fc",

        "stroke-width": Math.max(
          disconnectedNode
            ? 1.35
            : keyNode
              ? 1.2
              : 0.75,
          cellPx * (
            disconnectedNode
              ? 0.18
              : keyNode
                ? 0.16
                : 0.09
          )
        ),

        opacity: disconnectedNode
          ? "1"
          : keyNode
            ? "1"
            : "0.78",
        cursor: "move",
        "data-centerline-handle": key,
        "data-centerline-node-type": keyNode
          ? "key"
          : "intermediate",
        "data-disconnected-node": disconnectedNode
          ? "true"
          : "false"
      });

      handle.addEventListener(
        "pointerdown",
        (event) => beginCenterlineDrag(event, cell)
      );

      handle.addEventListener("click", (event) => {
        event.stopPropagation();
        selectedCenterlineNodeKey = key;
        renderCenterlineDebug();
      });

      centerlineDebugLayer.appendChild(handle);
    }
  }

  centerlineDebugLayer.style.display =
    centerlineEditMode ? "block" : "none";

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

function renderGrid() {
  clearMap();
  centerlineSkeleton = null;
  sampleMapLayer.style.display = "none";
  cellPx = Math.max(6, Math.min(14, 1500 / Math.max(gridMap.cols, gridMap.rows)));
  fullViewBox = { x: 0, y: 0, width: gridMap.cols * cellPx, height: gridMap.rows * cellPx };
  currentViewBox = { ...fullViewBox };
  floorMap.setAttribute("viewBox", `0 0 ${fullViewBox.width} ${fullViewBox.height}`);
  floorMap.style.aspectRatio = `${gridMap.cols} / ${gridMap.rows}`;

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

  for (const item of gridMap.destinations) {
    const group = svgEl("g", { class: "grid-booth-group", "data-booth-id": item.id });
    for (const shape of item.shapes) {
      const rect = svgEl("rect", {
        x: (shape.c1 - 1) * cellPx, y: (shape.r1 - 1) * cellPx,
        width: (shape.c2 - shape.c1 + 1) * cellPx,
        height: (shape.r2 - shape.r1 + 1) * cellPx,
        fill: `#${shape.color}`, stroke: "#64748b", "stroke-width": Math.max(0.7, cellPx * 0.08), class: "grid-booth"
      });
      group.appendChild(rect);
      const w = (shape.c2 - shape.c1 + 1) * cellPx;
      const h = (shape.r2 - shape.r1 + 1) * cellPx;
      if (w >= 2.5 * cellPx && h >= 1.5 * cellPx) {
        const text = svgEl("text", {
          x: (shape.c1 - 1) * cellPx + w / 2,
          y: (shape.r1 - 1) * cellPx + h / 2,
          class: "grid-label", "font-size": Math.max(5, Math.min(11, Math.min(w / 5, h / 2)))
        });
        text.textContent = item.id;
        group.appendChild(text);
      }
    }
    group.addEventListener("click", (e) => { e.stopPropagation(); handleBoothMapClick(item); });
    boothsLayer.appendChild(group);
  }
  loadCenterlineOverrides();

  centerlineSkeleton = applyCenterlineCustomNodes(
    applyCenterlineNodeMerges(
      applyCenterlineDeletedNodes(
        buildSingleCenterlineSkeleton()
      )
    )
  );

  if (isAdminScreen()) {
    renderCenterlineDebug();
    ensureCenterlineEditorControls();
  } else {
    centerlineDebugLayer?.remove();
    centerlineDebugLayer = null;
    ensureCenterlineDebugToggle();
  }
  populateStarts();
  renderResults(searchInput?.value || "");
  updateStartMarker();
  routeInfo.textContent = `${gridMap.sheetName} · 부스 ${gridMap.stats.boothCount}개 · 복도 ${gridMap.stats.walkableCount.toLocaleString()}㎡`;
}

function renderSample(destinations, locations) {
  clearMap();
  sampleMapLayer.style.display = "block";
  fullViewBox = { x: 0, y: 0, width: 1000, height: 650 };
  currentViewBox = { ...fullViewBox };
  floorMap.setAttribute("viewBox", "0 0 1000 650");
  floorMap.style.aspectRatio = "1000 / 650";
  destinations.forEach((item) => {
    const g = svgEl("g");
    const rect = svgEl("rect", { x: item.x, y: item.y, width: item.width, height: item.height, rx: 8, class: item.type === "booth" ? "booth" : "facility" });
    const text = svgEl("text", { x: item.x + item.width / 2, y: item.y + item.height / 2, class: "map-label" });
    text.textContent = item.booth === "-" ? item.name : item.booth;
    g.append(rect, text); g.addEventListener("click", () => selectDestination(item));
    (item.type === "booth" ? boothsLayer : facilitiesLayer).appendChild(g);
  });
  startSelect.innerHTML = "";
  locations.forEach((loc) => { const o = new Option(loc.name, loc.id); o.dataset.x = loc.x; o.dataset.y = loc.y; startSelect.add(o); });
  renderResults("");
  updateStartMarker();
}

function getDestinations() { return gridMap ? gridMap.destinations : sampleDestinations; }

function renderResults(queryText) {
  if (!results) return;
  const q = normalize(queryText);
  const matched = getDestinations().filter((d) => !q || [d.id, d.booth, d.name, d.category, ...(d.keywords || [])].some((v) => normalize(v).includes(q))).slice(0, 120);
  results.innerHTML = "";
  if (!matched.length) { results.innerHTML = '<p class="hint">검색 결과가 없습니다.</p>'; return; }
  for (const item of matched) {
    const b = document.createElement("button"); b.type = "button"; b.className = "result-item";
    b.innerHTML = `<strong>${item.name || item.id}</strong><span>${item.booth || item.id} · ${item.category || "부스"}</span>`;
    b.addEventListener("click", () => selectDestination(item)); results.appendChild(b);
  }
}

function getBoothCorrectionSelection() {
  const id = $("#boothCorrectionSelect")?.value;
  return gridMap?.destinations.find((d) => d.id === id) || null;
}

function refreshBoothCorrectionOptions(query = "") {
  const select = $("#boothCorrectionSelect");
  if (!select || !gridMap) return;
  const q = normalize(query);
  const previous = select.value;
  const matches = gridMap.destinations.filter((d) => !q || normalize(d.id).includes(q) || normalize(d.name).includes(q)).slice(0, 300);
  select.innerHTML = "";
  matches.forEach((d) => select.add(new Option(d.id, d.id)));
  if (matches.some((d) => d.id === previous)) select.value = previous;
}

function destinationCenter(item) {
  const shapes = item?.shapes || [];
  if (!shapes.length) return null;
  const minC = Math.min(...shapes.map((s) => s.c1));
  const maxC = Math.max(...shapes.map((s) => s.c2));
  const minR = Math.min(...shapes.map((s) => s.r1));
  const maxR = Math.max(...shapes.map((s) => s.r2));
  return { x: ((minC - 1) + maxC) * cellPx / 2, y: ((minR - 1) + maxR) * cellPx / 2 };
}

function highlightCorrectionBooth(id) {
  document.querySelectorAll(".grid-booth-group").forEach((g) => g.classList.toggle("correction-selected", g.dataset.boothId === id));
}

function locateCorrectionBooth() {
  const item = getBoothCorrectionSelection();
  const status = $("#boothCorrectionStatus");
  if (!item) { if (status) status.textContent = "검색된 부스를 선택해 주세요."; return; }
  selectDestination(item);
  highlightCorrectionBooth(item.id);
  const points = [];
  (item.shapes || []).forEach((s) => {
    points.push({ x: (s.c1 - 1) * cellPx, y: (s.r1 - 1) * cellPx });
    points.push({ x: s.c2 * cellPx, y: s.r2 * cellPx });
  });
  fitViewToPoints(points, 8);
  if (status) status.textContent = `${item.id} 위치를 지도에 표시했습니다.`;
}

function swapBoothPositions(source, target) {
  const sourceShapes = source.shapes;
  const sourceEntrances = source.entranceCandidates;
  source.shapes = target.shapes;
  source.entranceCandidates = target.entranceCandidates;
  target.shapes = sourceShapes;
  target.entranceCandidates = sourceEntrances;
  localStorage.setItem("exhibitionGridMap", JSON.stringify(gridMap));
}

function handleBoothMapClick(item) {
  if (boothCorrectionMode && gridMap) {
    const source = gridMap.destinations.find((d) => d.id === boothCorrectionSourceId);
    const status = $("#boothCorrectionStatus");
    if (!source) { boothCorrectionMode = false; floorMap.classList.remove("placement-mode"); return; }
    if (source.id === item.id) {
      boothCorrectionMode = false; floorMap.classList.remove("placement-mode");
      if (status) status.textContent = "같은 부스를 선택해 위치 수정이 취소되었습니다.";
      return;
    }
    swapBoothPositions(source, item);
    boothCorrectionMode = false; boothCorrectionSourceId = null; floorMap.classList.remove("placement-mode");
    renderGrid(); refreshBoothCorrectionOptions($("#boothCorrectionSearch")?.value || "");
    $("#boothCorrectionSelect").value = source.id; locateCorrectionBooth();
    if (status) status.textContent = `${source.id}와 ${item.id}의 위치를 서로 교체했습니다.`;
    return;
  }
  selectDestination(item);
}

function selectDestination(item) {
  selectedDestination = item;
  selectedCard?.classList.remove("hidden");
  selectedName.textContent = item.name || item.id;
  const entranceCount = gridMap ? centeredEntranceCandidates(item.entranceCandidates).length : 0;
  selectedMeta.textContent = gridMap ? `${item.id} · 출입 가능 지점 ${entranceCount}개` : `${item.booth || ""} · ${item.category || ""}`;
  routeLine.setAttribute("points", "");
  routeInfo.textContent = `${item.name || item.id}을(를) 선택했습니다.`;
  if (gridMap && item.shapes?.length) {
    const s = item.shapes[0]; const p = gridPoint((s.r1 + s.r2) / 2, (s.c1 + s.c2) / 2);
    destinationMarker.setAttribute("cx", p.x); destinationMarker.setAttribute("cy", p.y); destinationMarker.style.display = "block";
  }
}

function loadManagedLocations(){
  try{return JSON.parse(localStorage.getItem("exhibitionManagedLocations")||"[]");}catch{return [];}
}
function saveManagedLocations(items){localStorage.setItem("exhibitionManagedLocations",JSON.stringify(items));}
function populateStarts() {
  startSelect.innerHTML = "";
  const managed=loadManagedLocations().filter(p=>isWalkable(p.row,p.col));
  if(managed.length){
    managed.forEach(p=>{
      const o=new Option(p.name,p.code);o.dataset.row=p.row;o.dataset.col=p.col;startSelect.add(o);
    });
    const requested=new URLSearchParams(location.search).get("start");
    if(requested&&managed.some(p=>p.code===requested))startSelect.value=requested;
  }else{
    const defaults=findDefaultStarts();
    defaults.forEach((p,i)=>{
      const o=new Option(i===0?"기본 시작점":i===1?"중앙 복도":"반대편 시작점",`AUTO_${i}`);
      o.dataset.row=p.row;o.dataset.col=p.col;startSelect.add(o);
    });
  }
  const saved=localStorage.getItem("exhibitionCustomStart");
  if(saved){try{customStart=JSON.parse(saved);}catch{customStart=null;}}
  if(customStart&&isWalkable(customStart.row,customStart.col)){
    const o=new Option("지도에서 지정한 현재 위치","CUSTOM");o.dataset.row=customStart.row;o.dataset.col=customStart.col;startSelect.add(o);
    if(!new URLSearchParams(location.search).get("start"))startSelect.value="CUSTOM";
  }
}

function renderAdminLocations(){
  const list=$("#adminLocationList");if(!list)return;
  const items=loadManagedLocations();list.innerHTML="";
  if(!items.length){list.innerHTML='<p class="hint">등록된 위치가 없습니다.</p>';return;}
  items.forEach(item=>{
    const wrap=document.createElement("div");wrap.className="admin-location-item";
    wrap.innerHTML=`<strong>${item.name}</strong><span>${item.code} · ${item.col}열 ${item.row}행</span><div class="admin-location-actions"><button type="button" data-edit-location="${item.code}">수정</button><button type="button" data-delete-location="${item.code}">삭제</button></div>`;
    list.appendChild(wrap);
  });
  list.querySelectorAll("[data-edit-location]").forEach(btn=>btn.addEventListener("click",()=>{
    const item=items.find(x=>x.code===btn.dataset.editLocation);if(!item)return;
    $("#locationNameInput").value=item.name;$("#locationCodeInput").value=item.code;editingLocationId=item.code;
    $("#adminLocationStatus").textContent="수정할 위치를 지도에서 다시 선택하세요.";
  }));
  list.querySelectorAll("[data-delete-location]").forEach(btn=>btn.addEventListener("click",()=>{
    saveManagedLocations(items.filter(x=>x.code!==btn.dataset.deleteLocation));renderAdminLocations();populateStarts();updateStartMarker();
  }));
}

function saveAdminLocationAt(row,col){
  const name=$("#locationNameInput")?.value.trim();
  const code=$("#locationCodeInput")?.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"_");
  const status=$("#adminLocationStatus");
  if(!name||!code){status.textContent="표시명과 위치코드를 먼저 입력하세요.";return false;}
  const snapped=snapToCorridorCenter(row,col);if(!snapped){status.textContent="이동 가능한 복도에서 선택하세요.";return false;}
  let items=loadManagedLocations();
  if(editingLocationId)items=items.filter(x=>x.code!==editingLocationId);
  items=items.filter(x=>x.code!==code);
  items.push({name,code,row:snapped.row,col:snapped.col});saveManagedLocations(items);
  editingLocationId=null;adminLocationPickMode=false;floorMap.classList.remove("placement-mode");
  status.textContent=`${name}을(를) 복도 중앙 ${snapped.col}열 ${snapped.row}행에 저장했습니다.`;
  $("#locationNameInput").value="";$("#locationCodeInput").value="";
  renderAdminLocations();populateStarts();startSelect.value=code;updateStartMarker();return true;
}

function findDefaultStarts() {
  const all = [];
  for (let r = gridMap.rows; r >= 1; r--) for (let c = 1; c <= gridMap.cols; c++) if (isWalkable(r, c)) { all.push({ row: r, col: c }); if (all.length === 1) break; }
  let center = null, far = null, bestCenter = Infinity, bestFar = -1;
  const target = { row: gridMap.rows / 2, col: gridMap.cols / 2 };
  for (let r = 1; r <= gridMap.rows; r++) for (let c = 1; c <= gridMap.cols; c++) if (isWalkable(r, c)) {
    const dc = Math.hypot(r - target.row, c - target.col); if (dc < bestCenter) { bestCenter = dc; center = { row: r, col: c }; }
    const df = all[0] ? Math.abs(r - all[0].row) + Math.abs(c - all[0].col) : 0; if (df > bestFar) { bestFar = df; far = { row: r, col: c }; }
  }
  return [all[0] || center, center || all[0], far || center].filter(Boolean);
}

function currentStartCell() {
  if (!gridMap) return null;
  const o = startSelect.selectedOptions[0];
  return { row: Number(o?.dataset.row), col: Number(o?.dataset.col) };
}

function updateStartMarker() {
  if (gridMap) {
    const s = currentStartCell(); if (!s) return;
    const p = gridPoint(s.row, s.col); startMarker.setAttribute("cx", p.x); startMarker.setAttribute("cy", p.y); startMarker.setAttribute("r", Math.max(3, cellPx * 0.45)); startMarker.style.display = "block";
    locationStatus.textContent = `현재 위치: ${s.col}열 ${s.row}행 (1칸 = 1m)`;
  } else {
    const o = startSelect.selectedOptions[0]; if (!o) return;
    startMarker.setAttribute("cx", o.dataset.x); startMarker.setAttribute("cy", o.dataset.y); startMarker.style.display = "block";
  }
  routeLine.setAttribute("points", "");
}

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

  clearanceMap ||= buildClearanceMap();
  centerlineSkeleton ||= buildSingleCenterlineSkeleton();

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

  function graphRoute(startCell, targetCell) {
    const count = skeleton.cells.length;
    const dirCount = 9; // 8방향 + 시작방향 없음
    const stateCount = count * dirCount;

    const distance = new Float64Array(stateCount);
    const turns = new Int32Array(stateCount);
    const previous = new Int32Array(stateCount);
    const previousLink = new Int32Array(stateCount);

    distance.fill(Infinity);
    turns.fill(2147483647);
    previous.fill(-1);
    previousLink.fill(-1);

    function direction(a, b) {
      const dr = Math.sign(b.row - a.row);
      const dc = Math.sign(b.col - a.col);
      return (dr + 1) * 3 + (dc + 1);
    }

    function stateKey(cellId, dir) {
      return cellId * dirCount + dir;
    }

    const heap = [];

    function compare(a, b) {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.turns - b.turns;
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

    const startState = stateKey(startCell.id, 8);
    distance[startState] = 0;
    turns[startState] = 0;

    push({
      state: startState,
      cellId: startCell.id,
      dir: 8,
      distance: 0,
      turns: 0
    });

    let foundState = -1;

    while (heap.length) {
      const current = pop();

      if (
        current.distance !== distance[current.state] ||
        current.turns !== turns[current.state]
      ) {
        continue;
      }

      if (current.cellId === targetCell.id) {
        foundState = current.state;
        break;
      }

      const cell = skeleton.cells[current.cellId];

      for (let linkIndex = 0; linkIndex < cell.links.length; linkIndex++) {
        const link = cell.links[linkIndex];
        const next = skeleton.cells[link.to];
        if (!next) continue;

        const nextDir = direction(cell, next);
        const nextDistance = current.distance + link.cost;
        const nextTurns =
          current.turns +
          (
            current.dir !== 8 &&
            current.dir !== nextDir
              ? 1
              : 0
          );

        const nextState = stateKey(next.id, nextDir);

        if (
          nextDistance < distance[nextState] ||
          (
            nextDistance === distance[nextState] &&
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
      turns: turns[foundState]
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

    const middle = graphRoute(
      startConnector.cell,
      targetConnector.cell
    );

    if (!middle) continue;

    const combined = [];

    combined.push(...startConnector.path);
    combined.push(...middle.cells);

    const reversedTarget = [...targetConnector.path].reverse();
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

    const evaluated = {
      cells: compacted,
      entrance: candidate,
      routePoints,
      distance: Math.round(finalDistance),
      turns: metrics.turns
    };

    if (
      !best ||
      evaluated.distance < best.distance ||
      (
        evaluated.distance === best.distance &&
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

function showRoute() {
  if (!selectedDestination) return;

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
    Math.max(3,cellPx*0.65)
  );

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
    `${sideName} 출입면으로 안내`;

  requestAnimationFrame(()=>
    fitViewToPoints(routePoints)
  );
}

function applyViewBox() { floorMap.setAttribute("viewBox", `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`); }
function fitMap() { currentViewBox = { ...fullViewBox }; applyViewBox(); }
function zoomMap(factor, cx = currentViewBox.x + currentViewBox.width/2, cy = currentViewBox.y + currentViewBox.height/2) {
  const minW = fullViewBox.width * 0.08; const nw = Math.max(minW, Math.min(fullViewBox.width, currentViewBox.width * factor)); const nh = nw * fullViewBox.height / fullViewBox.width; const ratio = nw / currentViewBox.width;
  let x = cx - (cx - currentViewBox.x) * ratio, y = cy - (cy - currentViewBox.y) * ratio;
  x = Math.max(0, Math.min(fullViewBox.width - nw, x)); y = Math.max(0, Math.min(fullViewBox.height - nh, y)); currentViewBox = { x, y, width: nw, height: nh }; applyViewBox();
}
function clientToSvg(clientX, clientY) {
  const point = floorMap.createSVGPoint();

  point.x = clientX;
  point.y = clientY;

  const screenMatrix = floorMap.getScreenCTM();

  if (!screenMatrix) {
    return {
      x: clientX,
      y: clientY
    };
  }

  const svgPoint = point.matrixTransform(
    screenMatrix.inverse()
  );

  return {
    x: svgPoint.x,
    y: svgPoint.y
  };
}
function pointDistance(a,b){ return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); }

$("#zoomInBtn")?.addEventListener("click", () => zoomMap(.75));
$("#zoomOutBtn")?.addEventListener("click", () => zoomMap(1.33));
$("#fitBtn")?.addEventListener("click", fitMap);
floorMap.addEventListener("wheel", (e) => { e.preventDefault(); const p=clientToSvg(e.clientX,e.clientY); zoomMap(e.deltaY<0?.85:1.18,p.x,p.y); }, {passive:false});
floorMap.addEventListener("pointerdown", (e) => {
  if (centerlineEditMode) {
    // 편집 모드에서 핸들이 아닌 영역은 지도 이동을 시작하지 않는다.
    if (!e.target?.hasAttribute?.("data-centerline-handle")) return;
  }

  if (adminLocationPickMode && gridMap) {
    const p=clientToSvg(e.clientX,e.clientY);const col=Math.floor(p.x/cellPx)+1,row=Math.floor(p.y/cellPx)+1;
    if(!isWalkable(row,col)){const st=$("#adminLocationStatus");if(st)st.textContent="흰색 복도 위치를 선택해 주세요.";return;}
    saveAdminLocationAt(row,col);return;
  }
  if (startPickMode && gridMap) {
    const p=clientToSvg(e.clientX,e.clientY); const col=Math.floor(p.x/cellPx)+1,row=Math.floor(p.y/cellPx)+1;
    if (!isWalkable(row,col)) { locationStatus.textContent="흰색 복도 셀을 선택해 주세요."; return; }
    const snapped=snapToCorridorCenter(row,col);
    customStart=snapped; localStorage.setItem("exhibitionCustomStart",JSON.stringify(customStart)); startPickMode=false; floorMap.classList.remove("placement-mode"); populateStarts(); updateStartMarker(); locationStatus.textContent=`선택 지점을 복도 중앙(${snapped.col}열 ${snapped.row}행)으로 자동 보정했습니다.`; return;
  }
  floorMap.setPointerCapture(e.pointerId); pointers.set(e.pointerId,e); floorMap.classList.add("dragging");
  if(pointers.size===1) dragStart={clientX:e.clientX,clientY:e.clientY,viewBox:{...currentViewBox}};
  else if(pointers.size===2){const[a,b]=[...pointers.values()];pinchStartDistance=pointDistance(a,b);pinchStartViewBox={...currentViewBox};dragStart=null;}
});
floorMap.addEventListener("pointermove",(e)=>{if(moveCenterlineDrag(e))return;if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,e);if(pointers.size===1&&dragStart&&currentViewBox.width<fullViewBox.width){const r=floorMap.getBoundingClientRect();const dx=(e.clientX-dragStart.clientX)/r.width*dragStart.viewBox.width,dy=(e.clientY-dragStart.clientY)/r.height*dragStart.viewBox.height;currentViewBox.x=Math.max(0,Math.min(fullViewBox.width-currentViewBox.width,dragStart.viewBox.x-dx));currentViewBox.y=Math.max(0,Math.min(fullViewBox.height-currentViewBox.height,dragStart.viewBox.y-dy));applyViewBox();}else if(pointers.size===2&&pinchStartViewBox){const[a,b]=[...pointers.values()],d=pointDistance(a,b);const mid={clientX:(a.clientX+b.clientX)/2,clientY:(a.clientY+b.clientY)/2},c=clientToSvg(mid.clientX,mid.clientY);currentViewBox={...pinchStartViewBox};zoomMap(pinchStartDistance/d,c.x,c.y);}});
function endPointer(e){if(endCenterlineDrag(e))return;pointers.delete(e.pointerId);if(!pointers.size){dragStart=null;pinchStartViewBox=null;floorMap.classList.remove("dragging");}}
floorMap.addEventListener("pointerup",endPointer);floorMap.addEventListener("pointercancel",endPointer);

searchInput?.addEventListener("input",e=>renderResults(e.target.value)); startSelect?.addEventListener("change",updateStartMarker); routeBtn?.addEventListener("click",showRoute);
pickStartBtn?.addEventListener("click",()=>{if(!gridMap){locationStatus.textContent="먼저 관리자 화면에서 배치 엑셀을 등록해 주세요.";return;}startPickMode=true;floorMap.classList.add("placement-mode");locationStatus.textContent="지도에서 흰색 복도 위치를 누르세요.";});
$("#pickAdminLocationBtn")?.addEventListener("click",()=>{const st=$("#adminLocationStatus");if(!gridMap){st.textContent="먼저 전시장 배치 엑셀을 등록해 주세요.";return;}if(!$("#locationNameInput").value.trim()||!$("#locationCodeInput").value.trim()){st.textContent="표시명과 위치코드를 먼저 입력하세요.";return;}adminLocationPickMode=true;startPickMode=false;floorMap.classList.add("placement-mode");st.textContent="지도에서 복도의 임의 지점을 선택하세요. 중앙으로 자동 보정됩니다.";});
$("#boothCorrectionSearch")?.addEventListener("input", (e) => refreshBoothCorrectionOptions(e.target.value));
$("#boothCorrectionSelect")?.addEventListener("change", locateCorrectionBooth);
$("#locateBoothBtn")?.addEventListener("click", locateCorrectionBooth);
$("#startBoothCorrectionBtn")?.addEventListener("click", () => {
  const item = getBoothCorrectionSelection();
  const status = $("#boothCorrectionStatus");
  if (!gridMap || !item) { if (status) status.textContent = "먼저 배치 엑셀을 등록하고 부스를 선택하세요."; return; }
  boothCorrectionMode = true; boothCorrectionSourceId = item.id; startPickMode = false; adminLocationPickMode = false;
  floorMap.classList.add("placement-mode"); highlightCorrectionBooth(item.id);
  if (status) status.textContent = `${item.id}의 실제 위치에 있는 다른 부스를 지도에서 선택하세요. 두 위치가 교체됩니다.`;
});
$("#restoreBoothLayoutBtn")?.addEventListener("click", () => {
  const original = localStorage.getItem("exhibitionGridMapOriginal");
  const status = $("#boothCorrectionStatus");
  if (!original) { if (status) status.textContent = "복원할 엑셀 자동매칭 원본이 없습니다."; return; }
  localStorage.setItem("exhibitionGridMap", original); gridMap = JSON.parse(original); clearanceMap = null;
  renderGrid(); refreshBoothCorrectionOptions();
  if (status) status.textContent = "엑셀 자동매칭 상태로 복원했습니다.";
});

document.addEventListener("keydown", (event) => {
  if (
    !centerlineEditMode ||
    !selectedCenterlineNodeKey
  ) {
    return;
  }

  if (
    event.key === "Delete" ||
    event.key === "Backspace"
  ) {
    event.preventDefault();
    deleteSelectedCenterlineNode();
  }
});

resetBtn?.addEventListener("click",()=>{selectedDestination=null;selectedCard?.classList.add("hidden");searchInput.value="";routeLine.setAttribute("points","");destinationMarker.style.display="none";renderResults("");updateStartMarker();});

async function handleXlsxUpload(file) {
  const status=$("#xlsxLayoutStatus"), box=$("#xlsxAnalysis");
  try {
    status.textContent="엑셀의 병합 셀과 복도를 분석하고 있습니다…";
    const parsed=await XlsxGridParser.parseWorkbook(file);
    localStorage.setItem("exhibitionGridMapOriginal",JSON.stringify(parsed));
    localStorage.setItem("exhibitionGridMap",JSON.stringify(parsed)); gridMap=parsed; clearanceMap=null;
    box.classList.remove("hidden");
    box.innerHTML=`<strong>분석 완료</strong><dl><div><dt>시트</dt><dd>${parsed.sheetName}</dd></div><div><dt>격자</dt><dd>${parsed.cols} × ${parsed.rows}칸</dd></div><div><dt>인식 부스</dt><dd>${parsed.stats.boothCount}개</dd></div><div><dt>이동 가능 복도</dt><dd>${parsed.stats.walkableCount.toLocaleString()}㎡</dd></div><div><dt>다중 영역 부스</dt><dd>${parsed.stats.duplicateShapeCount}개</dd></div><div><dt>출입면 없음</dt><dd>${parsed.stats.noEntrance.length}개</dd></div></dl>${parsed.stats.noEntrance.length?`<p class="analysis-warning">확인 필요: ${parsed.stats.noEntrance.slice(0,20).join(", ")}${parsed.stats.noEntrance.length>20?" 외":""}</p>`:""}`;
    status.textContent="사용자 화면에도 즉시 반영되었습니다."; renderGrid(); refreshBoothCorrectionOptions();
  } catch(e){console.error(e);status.textContent=`분석 실패: ${e.message}`;}
}
$("#xlsxLayoutInput")?.addEventListener("change",e=>{const f=e.target.files?.[0];if(f)handleXlsxUpload(f);});
$("#removeXlsxLayoutBtn")?.addEventListener("click",()=>{localStorage.removeItem("exhibitionGridMap");localStorage.removeItem("exhibitionCustomStart");localStorage.removeItem("exhibitionManagedLocations");location.reload();});

(async function init(){
  await applyDeploymentStateIfNeeded();
  loadStoredGrid();
  renderAdminLocations();
  ensureDeploymentExportButton();

  if(gridMap) {
    renderGrid();
    refreshBoothCorrectionOptions();
  } else {
    await loadSample();
  }

  renderResults("");
})();
