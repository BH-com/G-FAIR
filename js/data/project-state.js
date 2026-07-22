(() => {
  "use strict";

  const config = window.ExhibitionConfig;
  const storage = window.ExhibitionStorage;
  if (!config || !storage) {
    throw new Error("ProjectState 모듈보다 config.js와 storage.js를 먼저 불러와야 합니다.");
  }

  function currentExhibitionName() {
    const key = config.STORAGE_KEYS.EXHIBITION_NAME || "exhibitionName";
    return String(storage.getItem(key) || "").trim();
  }

  function collectDeploymentState() {
    const exhibitionName = currentExhibitionName();
    return {
      version: config.PROJECT_VERSION,
      exhibitionName: exhibitionName || undefined,
      exportedAt: new Date().toISOString(),
      storage: storage.collect(config.DEPLOYMENT_STORAGE_KEYS)
    };
  }

  function collectProjectState(projectName, view = {}) {
    const deployment = collectDeploymentState();
    return {
      format: config.PROJECT_FORMAT,
      version: config.PROJECT_VERSION,
      projectName: projectName || deployment.exhibitionName || "전시장 길찾기 프로젝트",
      exhibitionName: deployment.exhibitionName || projectName || "전시장 길찾기 프로젝트",
      exportedAt: deployment.exportedAt,
      storage: deployment.storage,
      view
    };
  }

  function validate(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new Error("프로젝트 파일 형식이 올바르지 않습니다.");
    }
    if (state.format && state.format !== config.PROJECT_FORMAT) {
      throw new Error("전시장 길찾기 프로젝트 파일이 아닙니다.");
    }
    if (!state.storage || typeof state.storage !== "object" || Array.isArray(state.storage)) {
      throw new Error("프로젝트 저장 데이터가 없습니다.");
    }
    return state;
  }

  function apply(state) {
    const validated = validate(state);
    storage.removeMany(config.DEPLOYMENT_STORAGE_KEYS);
    storage.apply(validated.storage, config.DEPLOYMENT_STORAGE_KEYS);

    const exhibitionNameKey = config.STORAGE_KEYS.EXHIBITION_NAME || "exhibitionName";
    const storedName = String(storage.getItem(exhibitionNameKey) || "").trim();
    const restoredName = String(
      validated.exhibitionName ||
      storedName ||
      validated.projectName ||
      ""
    ).trim();

    if (restoredName) {
      storage.setItem(exhibitionNameKey, restoredName);
    }

    return validated;
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  window.ExhibitionProjectState = Object.freeze({
    collectDeploymentState,
    collectProjectState,
    validate,
    apply,
    downloadJson
  });
})();
