/* FINDER modular section: core. Load order is defined in admin.html and index.html. */
const $ = (s) => document.querySelector(s);
const config = window.ExhibitionConfig;
const storage = window.ExhibitionStorage;
const projectIO = window.ExhibitionProjectIO;
if (!config || !storage || !projectIO) {
  throw new Error("config, storage, project-io 모듈을 먼저 불러와야 합니다.");
}
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

let gridMap = null;
let sampleDestinations = [];
let selectedDestination = null;
let customStart = null;
let startPickMode = false;
let adminLocationPickMode = false;
let editingLocationId = null;
let locationEditMode = false;
let selectedManagedLocationCode = null;
let managedLocationDrag = null;
let clearanceMap = null;
let cellPx = 10;
let fullViewBox = { x: 0, y: 0, width: 1000, height: 650 };
let currentViewBox = { ...fullViewBox };
let mapViewport = null;
const LAST_START_SELECTION_KEY = "exhibitionLastStartSelection";
const EXHIBITION_NAME_KEY = config.STORAGE_KEYS.EXHIBITION_NAME || "exhibitionName";
const DEFAULT_EXHIBITION_NAME = "G-FAIR KOREA 2026";

function currentExhibitionName() {
  return String(storage.getItem(EXHIBITION_NAME_KEY) || DEFAULT_EXHIBITION_NAME).trim() || DEFAULT_EXHIBITION_NAME;
}

function applyExhibitionIdentity() {
  const name = currentExhibitionName();
  const admin = isAdminScreen();
  const pageTitle = admin
    ? `${name} 전시장 안내 시스템 관리자`
    : `${name} 전시장 안내 시스템`;

  document.title = pageTitle;
  const topbarTitle = document.querySelector(".topbar h1");
  if (topbarTitle) topbarTitle.textContent = pageTitle;

  const mapTitle = document.querySelector(".map-toolbar > strong");
  if (mapTitle) mapTitle.textContent = `${name} 플로어맵`;

  const input = document.querySelector("#exhibitionNameInput");
  if (input && input.value !== name) input.value = name;
  return name;
}

function ensureExhibitionNameControl() {
  if (!isAdminScreen()) return;

  /*
   * 관리자 HTML에 기본 구조를 직접 선언한다.
   * 이전 파일과의 호환을 위해 구조가 없을 때만 최소 요소를 생성한다.
   */
  let section = document.querySelector("#exhibitionNameSettingSection");
  if (!section) {
    const xlsxSection = document.querySelector(".xlsx-layout-section");
    if (!xlsxSection) return;

    section = document.createElement("section");
    section.id = "exhibitionNameSettingSection";
    section.className = "exhibition-name-admin-section admin-card";
    section.innerHTML = `
      <span class="admin-badge">관리자 전용</span>
      <h2>전시회명 설정</h2>
      <label for="exhibitionNameInput">전시회명</label>
      <div class="exhibition-name-edit-row">
        <input id="exhibitionNameInput" type="text" maxlength="80" placeholder="예: G-FAIR KOREA 2026" readonly aria-readonly="true" />
        <button id="exhibitionNameEditBtn" type="button">이름 수정</button>
      </div>
      <p class="hint">저장한 전시회명은 관리자·사용자 제목과 플로어맵 안내 문구에 함께 적용됩니다.</p>
    `;
    xlsxSection.insertAdjacentElement("beforebegin", section);
  }

  if (section.dataset.initialized === "true") return;

  const input = section.querySelector("#exhibitionNameInput");
  const editButton = section.querySelector("#exhibitionNameEditBtn");
  if (!input || !editButton) return;

  section.dataset.initialized = "true";
  input.value = currentExhibitionName();
  input.readOnly = true;
  input.setAttribute("aria-readonly", "true");
  let originalValue = input.value;

  const finishEditing = (saveChanges) => {
    if (saveChanges) {
      const value = input.value.trim() || DEFAULT_EXHIBITION_NAME;
      input.value = value;
      storage.setItem(EXHIBITION_NAME_KEY, value);
      applyExhibitionIdentity();
      if (gridMap && !selectedDestination && routeInfo) routeInfo.textContent = value;
      broadcastLocalStateChange("exhibition-name");
      originalValue = value;
    } else {
      input.value = originalValue;
    }

    input.readOnly = true;
    input.setAttribute("aria-readonly", "true");
    section.classList.remove("editing");
    editButton.textContent = "이름 수정";
  };

  editButton.addEventListener("click", () => {
    if (input.readOnly) {
      originalValue = input.value;
      input.readOnly = false;
      input.setAttribute("aria-readonly", "false");
      section.classList.add("editing");
      editButton.textContent = "저장";
      input.focus();
      input.select();
      return;
    }
    finishEditing(true);
  });

  input.addEventListener("keydown", (event) => {
    if (input.readOnly) return;
    if (event.key === "Enter") {
      event.preventDefault();
      finishEditing(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishEditing(false);
    }
  });
}

// 복도 중앙선 진단용 오버레이
let centerlineDebugVisible = true;
let centerlineDebugLayer = null;
let centerlineSkeleton = null;
let centerlineDisconnectedNodeIds = new Set();
let centerlineDisconnectedComponents = [];
let centerlineIssueFocusIndex = 0;

// 관리자 후보 경로 편집 상태
let centerlineEditMode = false;
let centerlineOverrides = {};
let centerlineDeletedNodes = new Set();
let centerlineBypasses = {};
let centerlineMergedNodes = {};
let centerlineCustomNodes = {};
let selectedCenterlineNodeKey = null;
let centerlineDrag = null;
const CENTERLINE_OVERRIDE_KEY = config.STORAGE_KEYS.CENTERLINE_OVERRIDES;
const CENTERLINE_DELETED_KEY = config.STORAGE_KEYS.CENTERLINE_DELETED_NODES;
const CENTERLINE_BYPASS_KEY = config.STORAGE_KEYS.CENTERLINE_BYPASSES;
const CENTERLINE_MERGE_KEY = config.STORAGE_KEYS.CENTERLINE_MERGED_NODES;
const CENTERLINE_CUSTOM_NODE_KEY = config.STORAGE_KEYS.CENTERLINE_CUSTOM_NODES;

// 단순 안내 후보 경로 편집
let selectedRouteEdgeKey = null;
let selectedRouteSegmentId = null;
let selectedRouteSegment = null;
let routeDrawMode = false;
let routeEditorTool = null;
let routeDrawStartCell = null;
let suppressRouteVertexClickUntil = 0;
let routeSegmentDrag = null;
let pendingRouteSegmentPointer = null;
let routeClosedEdges = new Set();
let routeDeletedEdges = new Set();
let routeManualSegments = [];
const ROUTE_CLOSED_EDGE_KEY = config.STORAGE_KEYS.ROUTE_CLOSED_EDGES;
const ROUTE_DELETED_EDGE_KEY = config.STORAGE_KEYS.ROUTE_DELETED_EDGES;
const ROUTE_MANUAL_SEGMENT_KEY = config.STORAGE_KEYS.ROUTE_MANUAL_SEGMENTS;

// 벡터 경로 그래프. 존재하면 기존 셀 골격 대신 길찾기/편집의 기준으로 사용한다.
const JOINT_VECTOR_ROUTE_KEY = config.STORAGE_KEYS.JOINT_VECTOR_ROUTE;
let jointVectorRouteGraph = storage.getJson(JOINT_VECTOR_ROUTE_KEY, null);

// 관리자 부스번호 수동 보정
let boothLabelEditMode = false;
let boothLabelMoveMode = false;
let boothLabelOverrides = {};
let selectedBoothLabelId = null;
let boothLabelDrag = null;
let boothSplitMode = false;
const BOOTH_LABEL_OVERRIDE_KEY = config.STORAGE_KEYS.BOOTH_LABEL_OVERRIDES;

function svgEl(tag, attrs = {}) { return window.WayfindingUtils.svgElement(tag, attrs); }
function normalize(value) { return window.WayfindingUtils.normalizeSearch(value); }
function gridPoint(row, col) { return { x: (col - 0.5) * cellPx, y: (row - 0.5) * cellPx }; }
function isWalkable(row, col) {
  return !!gridMap && row >= 1 && row <= gridMap.rows && col >= 1 && col <= gridMap.cols && gridMap.walkableRows[row - 1][col - 1] === "1";
}


const DEPLOYMENT_STATE_PATH = config.DEPLOYMENT_STATE_PATH;

/*
 * 동일 브라우저의 여러 탭은 즉시 동기화한다.
 * 서로 다른 PC/휴대폰 간 실시간 동기화는 정적 파일만으로는 불가능하며,
 * 서버 API 또는 GitHub API 같은 쓰기 가능한 저장소가 필요하다.
 */
const LOCAL_SYNC_CHANNEL_NAME = config.LOCAL_SYNC_CHANNEL_NAME;
const localSyncChannel = typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel(LOCAL_SYNC_CHANNEL_NAME)
  : null;
let applyingExternalLocalState = false;

function broadcastLocalStateChange(reason = "update") {
  if (applyingExternalLocalState) return;
  localSyncChannel?.postMessage({
    reason,
    at: Date.now()
  });
}

function reloadStateFromLocalStoragePreservingView() {
  if (!gridMap) return;
  applyingExternalLocalState = true;
  try {
    loadStoredGrid();
    loadBoothLabelOverrides();
    loadCenterlineOverrides();
    applyExhibitionIdentity();
    if (gridMap) renderGridPreservingView();
  } finally {
    applyingExternalLocalState = false;
  }
}

localSyncChannel?.addEventListener("message", () => {
  reloadStateFromLocalStoragePreservingView();
});

window.addEventListener("storage", (event) => {
  if (!event.key || DEPLOYMENT_STORAGE_KEYS.includes(event.key)) {
    reloadStateFromLocalStoragePreservingView();
  }
});

const DEPLOYMENT_STORAGE_KEYS = config.DEPLOYMENT_STORAGE_KEYS;

function loadStoredGrid() {
  try {
    const parsed = JSON.parse(storage.getItem(config.STORAGE_KEYS.GRID_MAP) || "null");
    gridMap = parsed ? window.WayfindingValidators.validateGridMap(parsed) : null;
  } catch (error) {
    console.warn("저장된 배치도 데이터가 손상되어 초기화합니다.", error);
    gridMap = null;
    storage.removeItem(config.STORAGE_KEYS.GRID_MAP);
  }
}

function loadBoothLabelOverrides() {
  try {
    boothLabelOverrides = JSON.parse(
      storage.getItem(BOOTH_LABEL_OVERRIDE_KEY) || "{}"
    );
    if (!boothLabelOverrides || typeof boothLabelOverrides !== "object") {
      boothLabelOverrides = {};
    }
  } catch {
    boothLabelOverrides = {};
    storage.removeItem(BOOTH_LABEL_OVERRIDE_KEY);
  }
}

function saveBoothLabelOverrides() {
  storage.setItem(
    BOOTH_LABEL_OVERRIDE_KEY,
    JSON.stringify(boothLabelOverrides)
  );
  broadcastLocalStateChange("booth-label");
}

function boothLabelOverrideFor(id) {
  const value = boothLabelOverrides[id];
  return value && typeof value === "object" ? value : {};
}

async function loadSample() {
  // 사용자 화면에서는 샘플 기본 지도를 표시하지 않는다.
  sampleDestinations = [];
  if (sampleMapLayer) sampleMapLayer.style.display = "none";
  routeInfo.textContent = "관리자 화면에서 전시장 배치 엑셀을 등록해 주세요.";
}

function clearMap() {
  if (sampleMapLayer) sampleMapLayer.style.display = "none";
  centerlineDebugLayer?.remove();
  centerlineDebugLayer = null;
  document.querySelector("#gridBackground")?.remove();
  document.querySelector("#boothDepthLayer")?.remove();
  document.querySelector("#managedLocationLayer")?.remove();
  document.querySelector("#selectedBoothOverlay")?.remove();
  document.querySelector("#selectedBoothExtrusionLayer")?.remove();
  boothsLayer.innerHTML = "";
  facilitiesLayer.innerHTML = "";
  routeLine.setAttribute("points", "");
  document.querySelector("#routeFlowLayer")?.remove();
  startMarker.style.display = "none";
  destinationMarker.style.display = "none";
}
