/* FINDER modular section: locations. Load order is defined in admin.html and index.html. */
function loadManagedLocations(){
  try {
    const parsed = JSON.parse(storage.getItem(config.STORAGE_KEYS.MANAGED_LOCATIONS) || "[]");
    return window.WayfindingValidators.validateManagedLocations(parsed);
  } catch (error) {
    console.warn("현재 위치 데이터가 손상되었습니다.", error);
    return [];
  }
}
function saveManagedLocations(items){storage.setItem(config.STORAGE_KEYS.MANAGED_LOCATIONS,JSON.stringify(items));}

function managedLocationPoint(item) {
  const x = Number(item?.x);
  const y = Number(item?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  return gridPoint(item.row, item.col);
}

function nearestManagedLocationRoutePoint(point) {
  const graph = normalizeJointVectorGraph(
    jointVectorRouteGraph?.vertices?.length
      ? jointVectorRouteGraph
      : exportCurrentJointVectorGraph()
  );
  if (!graph?.vertices?.length || !graph?.segments?.length) return null;

  const vertices = new Map(graph.vertices.map((vertex) => [vertex.id, vertex]));
  let best = null;
  for (const segment of graph.segments) {
    if (segment.closed === true) continue;
    const first = vertices.get(segment.source);
    const second = vertices.get(segment.target);
    if (!first || !second) continue;
    const projected = projectPointToSegment(point, first, second);
    if (!best || projected.distance < best.distance) {
      best = { x: projected.x, y: projected.y, distance: projected.distance, segmentId: segment.id };
    }
  }
  return best;
}

function locationCellFromPoint(point) {
  const row = Math.floor(point.y / cellPx) + 1;
  const col = Math.floor(point.x / cellPx) + 1;
  if (isWalkable(row, col)) return { row, col };

  let best = null;
  for (let radius = 1; radius <= 4 && !best; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        const nextRow = row + dr;
        const nextCol = col + dc;
        if (!isWalkable(nextRow, nextCol)) continue;
        const center = gridPoint(nextRow, nextCol);
        const distance = Math.hypot(center.x - point.x, center.y - point.y);
        if (!best || distance < best.distance) best = { row: nextRow, col: nextCol, distance };
      }
    }
  }
  return best ? { row: best.row, col: best.col } : null;
}

function nextAutomaticQrLocation() {
  const used = new Set(loadManagedLocations().map((item) => String(item.code || '').toUpperCase()));
  let number = 1;
  while (used.has(`QR-${number}`)) number++;
  return { code: `QR-${number}`, name: `QR-${number}` };
}

function beginAutomaticQrLocationPick() {
  const status = document.querySelector('#adminLocationStatus');
  if (!gridMap) {
    if (status) status.textContent = '먼저 전시장 배치 엑셀을 등록해 주세요.';
    return;
  }
  const next = nextAutomaticQrLocation();
  const nameInput = document.querySelector('#locationNameInput');
  const codeInput = document.querySelector('#locationCodeInput');
  // 위치코드는 QR 주소용 내부 식별자이므로 자동 생성한다.
  // 사용자가 표시명을 미리 입력했다면 그 이름은 유지한다.
  if (nameInput && !nameInput.value.trim()) nameInput.value = next.name;
  if (codeInput) codeInput.value = next.code;
  editingLocationId = null;
  adminLocationPickMode = true;
  startPickMode = false;
  floorMap.classList.add('placement-mode');
  if (status) status.textContent = `${next.code}을 생성합니다. 지도에서 가까운 동선을 클릭하세요.`;
}
function arrangePanelSections() {
  /*
   * 화면 순서는 admin.html/index.html에 위에서 아래로 직접 선언한다.
   * 자바스크립트는 더 이상 카드를 이동하거나 합치지 않고,
   * 구버전 HTML을 열었을 때 필요한 클래스만 보정한다.
   */
  const panel = document.querySelector(".panel");
  if (!panel) return;

  const searchCard = panel.querySelector("#wayfindingSearchCard");
  const startSection = panel.querySelector(".start-location-section");
  const destinationSection = panel.querySelector(".destination-search-section") ||
    [...panel.children].find((element) => element.querySelector?.("#searchInput"));
  const selectedSection = panel.querySelector("#selectedCard");

  if (!searchCard) {
    const legacyCard = document.createElement("section");
    legacyCard.id = "wayfindingSearchCard";
    legacyCard.className = "wayfinding-search-card";
    if (isAdminScreen()) legacyCard.classList.add("admin-card");
    if (startSection) legacyCard.appendChild(startSection);
    if (destinationSection) legacyCard.appendChild(destinationSection);
    if (selectedSection) legacyCard.appendChild(selectedSection);
    panel.appendChild(legacyCard);
  }

  startSection?.classList.add("wayfinding-search-part");
  destinationSection?.classList.add("wayfinding-search-part");
}

function populateStarts() {
  if (!startSelect) return;

  const currentSelection = startSelect.value || "";
  const requestedSelection = new URLSearchParams(location.search).get("start") || "";
  const rememberedSelection = sessionStorage.getItem(LAST_START_SELECTION_KEY) || "";
  const preferredSelection = currentSelection || rememberedSelection || requestedSelection;

  startSelect.innerHTML = "";
  const managed = loadManagedLocations().filter((point) => isWalkable(point.row, point.col));

  if (managed.length) {
    managed.forEach((point) => {
      const option = new Option(point.name, point.code);
      option.dataset.row = point.row;
      option.dataset.col = point.col;
      if (Number.isFinite(Number(point.x))) option.dataset.x = point.x;
      if (Number.isFinite(Number(point.y))) option.dataset.y = point.y;
      startSelect.add(option);
    });
  } else {
    const defaults = findDefaultStarts();
    defaults.forEach((point, index) => {
      const option = new Option(
        index === 0 ? "기본 시작점" : index === 1 ? "중앙 복도" : "반대편 시작점",
        `AUTO_${index}`
      );
      option.dataset.row = point.row;
      option.dataset.col = point.col;
      startSelect.add(option);
    });
  }

  const saved = storage.getItem(config.STORAGE_KEYS.CUSTOM_START);
  if (saved) {
    try { customStart = JSON.parse(saved); } catch { customStart = null; }
  }
  if (customStart && isWalkable(customStart.row, customStart.col)) {
    const option = new Option("지도에서 지정한 현재 위치", "CUSTOM");
    option.dataset.row = customStart.row;
    option.dataset.col = customStart.col;
    startSelect.add(option);
  }

  const availableValues = new Set([...startSelect.options].map((option) => option.value));
  const initialFromQr = requestedSelection && availableValues.has(requestedSelection)
    ? requestedSelection
    : "";
  const nextSelection = availableValues.has(preferredSelection)
    ? preferredSelection
    : initialFromQr || startSelect.options[0]?.value || "";

  if (nextSelection) {
    startSelect.value = nextSelection;
    sessionStorage.setItem(LAST_START_SELECTION_KEY, nextSelection);
  }
}

function renderManagedLocationMarkers() {
  if (!floorMap || !gridMap) return;
  document.querySelector("#managedLocationLayer")?.remove();

  // QR 위치 핀은 관리자 편집 화면에서만 표시한다.
  // 일반 사용자 화면에서는 선택한 현재 위치를 길찾기 출발점으로만 사용한다.
  if (!isAdminScreen()) return;

  const layer = svgEl("g", { id: "managedLocationLayer" });
  const items = loadManagedLocations().filter((item) => isWalkable(item.row, item.col));

  // 지점 편집 중에는 길찾기 결과만 숨기고 참고용 경로는 유지한다.
  if (locationEditMode) {
    startMarker?.style.setProperty("display", "none", "important");
    destinationMarker?.style.setProperty("display", "none", "important");
    routeLine?.style.setProperty("display", "none", "important");
  } else {
    // 편집 모드를 벗어나면 이전의 강제 숨김을 반드시 해제한다.
    startMarker?.style.removeProperty("display");
    destinationMarker?.style.removeProperty("display");
    routeLine?.style.removeProperty("display");
  }

  for (const item of items) {
    const point = managedLocationPoint(item);
    const selected = selectedManagedLocationCode === item.code;
    const scale = Math.max(0.68, Math.min(0.9, cellPx / 11));
    const group = svgEl("g", {
      class: `managed-location-marker${selected ? " selected" : ""}`,
      "data-location-code": item.code,
      // 그룹 원점 자체가 핀의 뾰족한 끝점이므로 저장 좌표와 화면 기준점이 정확히 일치한다.
      transform: `translate(${point.x} ${point.y})`
    });

    // 동선 위 실제 기준점: 흰색 받침과 작은 빨간 점만 표시한다.
    const anchorHalo = svgEl("circle", {
      cx: 0,
      cy: 0,
      r: Math.max(2.8, cellPx * 0.28),
      fill: "#ffffff",
      stroke: selected ? "#f59e0b" : "#ffffff",
      "stroke-width": selected ? Math.max(0.7, cellPx * 0.07) : 0,
      class: "location-pin-anchor"
    });
    const anchorDot = svgEl("circle", {
      cx: 0,
      cy: 0,
      r: Math.max(1.05, cellPx * 0.11),
      fill: "#ef4444",
      class: "location-pin-anchor-dot"
    });

    // 핀의 끝점은 (0,0), 머리 부분은 위쪽에 위치한다.
    const pin = svgEl("path", {
      d: `M 0 0 C ${-1.6*scale} ${-2.2*scale}, ${-8*scale} ${-7.2*scale}, ${-8*scale} ${-13*scale} C ${-8*scale} ${-18*scale}, ${-4.5*scale} ${-22*scale}, 0 ${-22*scale} C ${4.5*scale} ${-22*scale}, ${8*scale} ${-18*scale}, ${8*scale} ${-13*scale} C ${8*scale} ${-7.2*scale}, ${1.6*scale} ${-2.2*scale}, 0 0 Z`,
      fill: "#e11d48",
      stroke: "#ffffff",
      "stroke-width": Math.max(0.7, cellPx * 0.07),
      class: "location-pin-body"
    });
    const pinHole = svgEl("circle", {
      cx: 0,
      cy: -13 * scale,
      r: Math.max(2.2, cellPx * 0.2),
      fill: "#ffffff"
    });
    const label = svgEl("text", {
      x: Math.max(8, cellPx * 0.72),
      y: -10.5 * scale,
      "font-size": Math.max(3.8, cellPx * 0.4),
      class: "location-pin-label",
      fill: "#9f1239"
    });
    label.textContent = item.name;
    group.append(anchorHalo, anchorDot, pin, pinHole, label);

    group.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedManagedLocationCode = item.code;
      renderManagedLocationMarkers();
      renderAdminLocations();
      const status = document.querySelector("#adminLocationStatus");
      if (status && isAdminScreen()) status.textContent = `${item.name} 지점을 선택했습니다. 지점 편집 모드에서는 핀을 끌어 동선 위에서 이동할 수 있습니다.`;
    });
    group.addEventListener("pointerdown", (event) => beginManagedLocationDrag(event, item));
    layer.appendChild(group);
  }

  floorMap.insertBefore(layer, routeLine);
}

function beginManagedLocationDrag(event, item) {
  if (!isAdminScreen() || !locationEditMode) return;
  event.preventDefault();
  event.stopPropagation();
  selectedManagedLocationCode = item.code;
  renderAdminLocations();
  managedLocationDrag = {
    pointerId: event.pointerId,
    code: item.code
  };
  floorMap.setPointerCapture(event.pointerId);
  renderManagedLocationMarkers();
}

function moveManagedLocationDrag(event) {
  if (!managedLocationDrag || event.pointerId !== managedLocationDrag.pointerId) return false;
  const pointer = clientToSvg(event.clientX, event.clientY);
  const snapped = nearestManagedLocationRoutePoint(pointer);
  if (!snapped) return true;
  const cell = locationCellFromPoint(snapped);
  if (!cell) return true;

  const items = loadManagedLocations();
  const item = items.find((entry) => entry.code === managedLocationDrag.code);
  if (!item) return true;
  item.row = cell.row;
  item.col = cell.col;
  item.x = snapped.x;
  item.y = snapped.y;
  saveManagedLocations(items);
  renderManagedLocationMarkers();
  return true;
}

function endManagedLocationDrag(event) {
  if (!managedLocationDrag || event.pointerId !== managedLocationDrag.pointerId) return false;
  managedLocationDrag = null;
  renderAdminLocations();
  populateStarts();
  updateStartMarker();
  broadcastLocalStateChange("location-move");
  return true;
}

function renderAdminLocations(){
  const list=$("#adminLocationList");if(!list)return;
  const items=loadManagedLocations();
  window.WayfindingRenderers.renderManagedLocations(
    list,
    items,
    selectedManagedLocationCode,
    (item) => { selectedManagedLocationCode = item.code; renderManagedLocationMarkers(); renderAdminLocations(); }
  );
  list.querySelectorAll("[data-edit-location]").forEach(btn=>btn.addEventListener("click",(event)=>{
    event.stopPropagation();
    const item=items.find(x=>x.code===btn.dataset.editLocation);if(!item)return;
    const nextName=prompt("지점 표시명을 입력하세요.", item.name || item.code);
    if(nextName===null)return;
    const trimmed=nextName.trim();
    if(!trimmed){alert("지점 이름을 입력하세요.");return;}
    item.name=trimmed;
    saveManagedLocations(items);
    selectedManagedLocationCode=item.code;
    renderAdminLocations();populateStarts();renderManagedLocationMarkers();updateStartMarker();broadcastLocalStateChange("location-rename");
    $("#adminLocationStatus").textContent=`${item.code}의 이름을 ${trimmed}(으)로 수정했습니다.`;
  }));
  list.querySelectorAll("[data-delete-location]").forEach(btn=>btn.addEventListener("click",(event)=>{
    event.stopPropagation();
    saveManagedLocations(items.filter(x=>x.code!==btn.dataset.deleteLocation));
    if(selectedManagedLocationCode===btn.dataset.deleteLocation)selectedManagedLocationCode=null;
    renderAdminLocations();populateStarts();updateStartMarker();renderManagedLocationMarkers();broadcastLocalStateChange("location-delete");
  }));
}

function saveAdminLocationAt(row,col, exactPoint = null){
  const nameInput=$("#locationNameInput");
  const codeInput=$("#locationCodeInput");
  const generated=nextAutomaticQrLocation();
  const code=(codeInput?.value.trim() || generated.code).toUpperCase().replace(/[^A-Z0-9_-]/g,"_");
  const name=nameInput?.value.trim() || code;
  const status=$("#adminLocationStatus");
  if(!code){status.textContent="새 위치코드를 생성하지 못했습니다.";return false;}
  if(codeInput) codeInput.value=code;
  const clickedPoint = exactPoint || gridPoint(row, col);
  const snapped = nearestManagedLocationRoutePoint(clickedPoint);
  if(!snapped){status.textContent="등록 가능한 동선 경로가 없습니다. 먼저 경로를 확인해 주세요.";return false;}
  const cell = locationCellFromPoint(snapped);
  if(!cell){status.textContent="동선과 연결된 복도 위치를 찾지 못했습니다.";return false;}
  let items=loadManagedLocations();
  if(editingLocationId)items=items.filter(x=>x.code!==editingLocationId);
  items=items.filter(x=>x.code!==code);
  items.push({name,code,row:cell.row,col:cell.col,x:snapped.x,y:snapped.y});saveManagedLocations(items);
  editingLocationId=null;adminLocationPickMode=false;floorMap.classList.remove("placement-mode");
  status.textContent=`${name}을(를) 가장 가까운 동선 위에 저장했습니다.`;
  $("#locationNameInput").value="";$("#locationCodeInput").value="";
  selectedManagedLocationCode=code;renderAdminLocations();populateStarts();if(startSelect)startSelect.value=code;updateStartMarker();renderManagedLocationMarkers();broadcastLocalStateChange("location-save");return true;
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
  if (!gridMap || !startSelect) return null;
  const o = startSelect.selectedOptions[0];
  return { row: Number(o?.dataset.row), col: Number(o?.dataset.col) };
}

function updateStartMarker() {
  if (!startMarker || !startSelect) return;
  if (locationEditMode) {
    startMarker.style.display = "none";
    destinationMarker?.style && (destinationMarker.style.display = "none");
    routeLine?.setAttribute("points", "");
    return;
  }
  startMarker.style.removeProperty("display");
  startMarker.style.removeProperty("visibility");
  if (gridMap) {
    const s = currentStartCell();
    if (!s || !Number.isFinite(s.row) || !Number.isFinite(s.col)) return;
    const p = gridPoint(s.row, s.col);
    startMarker.setAttribute("cx", p.x);
    startMarker.setAttribute("cy", p.y);
    startMarker.setAttribute("r", Math.max(3, cellPx * 0.45));
    startMarker.style.display = "block";
    if (locationStatus) {
      locationStatus.textContent = `현재 위치: ${s.col}열 ${s.row}행 (1칸 = 1m)`;
    }
  } else {
    const o = startSelect.selectedOptions[0];
    if (!o) return;
    startMarker.setAttribute("cx", o.dataset.x);
    startMarker.setAttribute("cy", o.dataset.y);
    startMarker.style.display = "block";
  }
  if (routeLine) routeLine.setAttribute("points", "");
}
