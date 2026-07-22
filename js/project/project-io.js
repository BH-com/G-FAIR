(() => {
  "use strict";

  const config = window.ExhibitionConfig;
  const storage = window.ExhibitionStorage;
  const projectState = window.ExhibitionProjectState;

  if (!config || !storage || !projectState) {
    throw new Error("ProjectIO 모듈보다 config.js, storage.js, project-state.js를 먼저 불러와야 합니다.");
  }

  function collectProjectState(projectName, getViewState) {
    const view = typeof getViewState === "function" ? getViewState() : {};
    return projectState.collectProjectState(projectName, view || {});
  }

  function applyProjectState(state, onApplied) {
    const validated = projectState.apply(state);
    if (typeof onApplied === "function") onApplied(validated);
    return validated;
  }

  async function importProjectFile(file, options = {}) {
    const text = await file.text();
    let state;

    try {
      state = JSON.parse(text);
    } catch {
      throw new Error("JSON 파일을 읽지 못했습니다.");
    }

    projectState.validate(state);

    const projectLabel = state.projectName || state.exhibitionName || file.name;
    const confirmImport = options.confirmImport || window.confirm.bind(window);
    const accepted = confirmImport(
      `프로젝트 '${projectLabel}'을 불러오시겠습니까?\n\n` +
      "현재 작업은 불러온 프로젝트 내용으로 교체됩니다. 필요한 경우 먼저 프로젝트를 내보내세요."
    );

    if (!accepted) return false;

    applyProjectState(state, options.onApplied);

    if (options.reload !== false) {
      window.location.reload();
    }

    return true;
  }

  function ensureControls(options = {}) {
    const isAdmin = typeof options.isAdminScreen === "function"
      ? options.isAdminScreen()
      : false;

    if (!isAdmin) return;

    const headerActions = document.querySelector(".header-actions");
    if (!headerActions || document.querySelector("#exportProjectBtn")) return;

    const currentExhibitionName = options.currentExhibitionName || (() => "전시장 길찾기 프로젝트");
    const getViewState = options.getViewState || (() => ({}));

    const exportButton = document.createElement("button");
    exportButton.id = "exportProjectBtn";
    exportButton.type = "button";
    exportButton.textContent = "프로젝트 내보내기";
    exportButton.title = "현재 작업 전체를 프로젝트 및 배포용 JSON으로 저장";
    exportButton.addEventListener("click", () => {
      const defaultName = currentExhibitionName();
      const projectName = window.prompt("프로젝트 이름을 입력하세요.", defaultName);
      if (projectName === null) return;

      const state = collectProjectState(projectName.trim() || defaultName, getViewState);
      projectState.downloadJson(state, "deployment-state.json");
      window.alert(
        "프로젝트 파일을 내보냈습니다. 이 파일은 다시 불러올 수 있고, " +
        "GitHub data 폴더에 deployment-state.json으로 올리면 배포 데이터로도 사용할 수 있습니다."
      );
    });

    const importButton = document.createElement("button");
    importButton.id = "importProjectBtn";
    importButton.type = "button";
    importButton.textContent = "프로젝트 불러오기";
    importButton.title = "이전에 내보낸 프로젝트 또는 deployment-state.json 불러오기";

    const input = document.createElement("input");
    input.id = "projectFileInput";
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;

      try {
        await importProjectFile(file, {
          onApplied: options.onApplied,
          reload: options.reloadAfterImport
        });
      } catch (error) {
        window.alert(`프로젝트 불러오기 실패: ${error.message}`);
      }
    });

    importButton.addEventListener("click", () => input.click());

    headerActions.style.flexWrap = "wrap";
    headerActions.append(exportButton, importButton, input);
  }

  async function applyDeploymentStateIfNeeded(options = {}) {
    const gridMapKey = config.STORAGE_KEYS.GRID_MAP;
    if (!options.force && storage.getItem(gridMapKey)) return false;

    try {
      const response = await fetch(
        options.path || config.DEPLOYMENT_STATE_PATH,
        { cache: "no-store" }
      );

      if (!response.ok) return false;

      const state = await response.json();
      projectState.validate(state);
      projectState.apply(state);

      if (typeof options.onApplied === "function") {
        options.onApplied(state);
      }

      return true;
    } catch (error) {
      console.info("배포 데이터 파일이 없거나 읽지 못했습니다.", error);
      return false;
    }
  }

  window.ExhibitionProjectIO = Object.freeze({
    collectProjectState,
    applyProjectState,
    importProjectFile,
    ensureControls,
    applyDeploymentStateIfNeeded
  });
})();
