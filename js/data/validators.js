(() => {
  "use strict";
  function assertObject(value, message) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  }
  function validateGridMap(map) {
    assertObject(map, "배치도 데이터가 객체가 아닙니다.");
    if (!Number.isInteger(map.rows) || map.rows <= 0) throw new Error("배치도 행 수가 올바르지 않습니다.");
    if (!Number.isInteger(map.cols) || map.cols <= 0) throw new Error("배치도 열 수가 올바르지 않습니다.");
    if (!Array.isArray(map.walkableRows) || map.walkableRows.length !== map.rows) throw new Error("복도 행 데이터 수가 맞지 않습니다.");
    for (let i = 0; i < map.walkableRows.length; i++) {
      const row = map.walkableRows[i];
      if (typeof row !== "string" || row.length !== map.cols || /[^01]/.test(row)) {
        throw new Error(`${i + 1}행 복도 데이터가 손상되었습니다.`);
      }
    }
    if (!Array.isArray(map.destinations)) throw new Error("목적지 목록이 없습니다.");
    return map;
  }
  function validateManagedLocations(items) {
    if (!Array.isArray(items)) throw new Error("현재 위치 데이터가 배열이 아닙니다.");
    const seen = new Set();
    return items.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const code = String(item.code || item.id || "").trim();
      if (!code || seen.has(code)) return false;
      seen.add(code);
      return Number.isFinite(Number(item.row)) && Number.isFinite(Number(item.col));
    });
  }
  function validateDeploymentState(state) {
    assertObject(state, "배포 데이터 형식이 올바르지 않습니다.");
    assertObject(state.storage, "배포 저장 데이터가 없습니다.");
    return state;
  }
  window.WayfindingValidators = Object.freeze({ validateGridMap, validateManagedLocations, validateDeploymentState });
})();
