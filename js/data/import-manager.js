/* FINDER modular section: imports. Load order is defined in admin.html and index.html. */
async function handleXlsxUpload(file) {
  const status=$("#xlsxLayoutStatus"), box=$("#xlsxAnalysis");
  try {
    status.textContent="엑셀의 병합 셀과 복도를 분석하고 있습니다…";
    const parsed=await XlsxGridParser.parseWorkbook(file);

    // 새 배치 엑셀은 완전히 새로운 프로젝트의 기준이다.
    // 이전 프로젝트 JSON/벡터 경로/수동 경로 편집값을 자동 승계하지 않는다.
    jointVectorRouteGraph = null;
    storage.removeItem(JOINT_VECTOR_ROUTE_KEY);
    storage.removeMany([
      config.STORAGE_KEYS.CENTERLINE_OVERRIDES,
      config.STORAGE_KEYS.CENTERLINE_DELETED_NODES,
      config.STORAGE_KEYS.CENTERLINE_BYPASSES,
      config.STORAGE_KEYS.CENTERLINE_MERGED_NODES,
      config.STORAGE_KEYS.CENTERLINE_CUSTOM_NODES,
      config.STORAGE_KEYS.ROUTE_CLOSED_EDGES,
      config.STORAGE_KEYS.ROUTE_DELETED_EDGES,
      config.STORAGE_KEYS.ROUTE_MANUAL_SEGMENTS
    ]);
    centerlineSkeleton = null;

    storage.setItem(config.STORAGE_KEYS.GRID_MAP_ORIGINAL,JSON.stringify(parsed));
    storage.setItem(config.STORAGE_KEYS.GRID_MAP,JSON.stringify(parsed)); gridMap=parsed; clearanceMap=null;
    boothLabelOverrides = {};
    saveBoothLabelOverrides();
    routeClosedEdges = new Set(); routeDeletedEdges = new Set(); routeManualSegments = []; saveCenterlineOverrides();
    box.classList.remove("hidden");
    window.WayfindingRenderers.renderAnalysis(box, parsed);
    status.textContent="사용자 화면에도 즉시 반영되었습니다."; renderGrid();
  } catch(e){console.error(e);status.textContent=`분석 실패: ${e.message}`;}
}
$("#xlsxLayoutInput")?.addEventListener("change",e=>{const f=e.target.files?.[0];if(f)handleXlsxUpload(f);});
$("#removeXlsxLayoutBtn")?.addEventListener("click", () => {
  if (!confirm("현재 배치도와 연결된 위치·경로 편집 데이터를 모두 삭제하시겠습니까?")) return;
  const exhibitionName = currentExhibitionName();
  storage.removeMany(DEPLOYMENT_STORAGE_KEYS);
  storage.setItem(EXHIBITION_NAME_KEY, exhibitionName);
  storage.removeItem("exhibitionBoothCorrections"); // 구버전 잔여 데이터 정리
  broadcastLocalStateChange("layout-reset");
  location.reload();
});


function normalizeBoothNumber(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function handleCompanyXlsxUpload(file) {
  const status = document.querySelector("#importStatus");
  try {
    if (!gridMap) throw new Error("먼저 부스배치도 엑셀을 등록해 주세요.");
    status.textContent = "참가기업 엑셀을 읽고 부스번호를 연결하고 있습니다…";
    const table = await XlsxGridParser.parseTableWorkbook(file);
    const required = ["부스번호", "기업명"];
    const missing = required.filter((name) => !table.headers.includes(name));
    if (missing.length) throw new Error(`필수 열 누락: ${missing.join(", ")}`);

    const boothMap = new Map(gridMap.destinations.map((item) => [normalizeBoothNumber(item.id || item.booth), item]));
    const seen = new Set();
    const imported = [];
    const errors = [];
    let applied = 0;

    for (const record of table.records) {
      const booth = normalizeBoothNumber(record["부스번호"]);
      const name = String(record["기업명"] || "").trim();
      if (!booth || !name) {
        errors.push(`${record.__row}행: 부스번호 또는 기업명 누락`);
        continue;
      }
      if (seen.has(booth)) {
        errors.push(`${record.__row}행: ${booth} 중복`);
        continue;
      }
      seen.add(booth);
      const destination = boothMap.get(booth);
      if (!destination) {
        errors.push(`${record.__row}행: ${booth} 배치도에 없음`);
        continue;
      }
      const keywordText = String(record["검색키워드"] || "");
      const keywords = keywordText.split(/[|,\n\r]+/).map((v)=>v.trim()).filter(Boolean);
      const info = {
        booth,
        name,
        nameEn: String(record["영문기업명"] || "").trim(),
        category: String(record["분야"] || "").trim(),
        products: String(record["대표품목"] || "").trim(),
        keywords,
        website: String(record["홈페이지"] || "").trim(),
        note: String(record["비고"] || "").trim()
      };
      destination.name = info.name;
      destination.nameEn = info.nameEn;
      destination.category = info.category || "참가기업";
      destination.products = info.products;
      destination.keywords = [...new Set([...(destination.keywords || []), info.nameEn, info.products, ...keywords].filter(Boolean))];
      destination.website = info.website;
      destination.note = info.note;
      imported.push(info);
      applied++;
    }

    storage.setItem(config.STORAGE_KEYS.IMPORTED_COMPANIES, JSON.stringify(imported));
    storage.setItem(config.STORAGE_KEYS.GRID_MAP, JSON.stringify(gridMap));
    renderGrid();
    const errorText = errors.length ? ` · 확인 ${errors.length}건 (${errors.slice(0,5).join(" / ")}${errors.length>5?" 외":""})` : "";
    status.textContent = `참가기업 ${table.records.length}개 중 ${applied}개 반영${errorText}`;
  } catch (error) {
    console.error(error);
    if (status) status.textContent = `참가기업 엑셀 반영 실패: ${error.message}`;
  }
}

document.querySelector("#companyXlsxInput")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) handleCompanyXlsxUpload(file);
});

document.querySelector("#restoreDataBtn")?.addEventListener("click", () => {
  const original = storage.getItem(config.STORAGE_KEYS.GRID_MAP_ORIGINAL);
  const status = document.querySelector("#importStatus");
  if (!original) {
    if (status) status.textContent = "복원할 부스배치도 원본이 없습니다.";
    return;
  }
  gridMap = JSON.parse(original);
  storage.setItem(config.STORAGE_KEYS.GRID_MAP, original);
  storage.removeItem(config.STORAGE_KEYS.IMPORTED_COMPANIES);
  clearanceMap = null;
  renderGrid();
  if (status) status.textContent = "참가기업 정보를 지우고 부스번호 기본 상태로 복원했습니다.";
});
