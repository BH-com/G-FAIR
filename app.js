/* FINDER modular section: bootstrap. Load order is defined in admin.html and index.html. */
(async function init(){
  /*
   * 사용자 화면은 GitHub의 최신 배포본을 우선 적용한다.
   * 관리자 화면은 현재 브라우저 작업(localStorage)을 우선 보존한다.
   */
  await projectIO.applyDeploymentStateIfNeeded({
    force: !isAdminScreen(),
    onApplied: () => broadcastLocalStateChange("deployment-load")
  });
  loadStoredGrid();
  loadBoothLabelOverrides();
  arrangePanelSections();
  ensureExhibitionNameControl();
  applyExhibitionIdentity();
  renderAdminLocations();
  projectIO.ensureControls({
    isAdminScreen,
    currentExhibitionName,
    getViewState: () => ({
      viewBox: { ...currentViewBox },
      selectedBoothId: selectedBoothLabelId || null
    }),
    onApplied: () => broadcastLocalStateChange("project-import")
  });
  ensureRouteMergeDebugControls();


  if(gridMap) {
    renderGrid();
  } else {
    await loadSample();
  }

  renderResults("");
})();
