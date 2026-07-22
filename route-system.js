(() => {
  "use strict";

  const backend = window.localStorage;

  function getItem(key) {
    try {
      return backend.getItem(key);
    } catch (error) {
      console.error(`[storage] 읽기 실패: ${key}`, error);
      return null;
    }
  }

  function setItem(key, value) {
    try {
      backend.setItem(key, String(value));
      return true;
    } catch (error) {
      console.error(`[storage] 저장 실패: ${key}`, error);
      throw new Error(`브라우저 저장공간에 '${key}' 데이터를 저장하지 못했습니다.`);
    }
  }

  function removeItem(key) {
    try {
      backend.removeItem(key);
      return true;
    } catch (error) {
      console.error(`[storage] 삭제 실패: ${key}`, error);
      return false;
    }
  }

  function getJson(key, fallback = null) {
    const raw = getItem(key);
    if (raw === null || raw === "") return fallback;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`[storage] 손상된 JSON 제거: ${key}`, error);
      removeItem(key);
      return fallback;
    }
  }

  function setJson(key, value) {
    return setItem(key, JSON.stringify(value));
  }

  function removeMany(keys) {
    for (const key of keys) removeItem(key);
  }

  function collect(keys) {
    const result = {};
    for (const key of keys) {
      const value = getItem(key);
      if (value !== null) result[key] = value;
    }
    return result;
  }

  function apply(values, allowedKeys = null) {
    if (!values || typeof values !== "object") return;
    const allowed = allowedKeys ? new Set(allowedKeys) : null;
    for (const [key, value] of Object.entries(values)) {
      if (allowed && !allowed.has(key)) continue;
      if (typeof value === "string") setItem(key, value);
    }
  }

  window.ExhibitionStorage = Object.freeze({
    getItem,
    setItem,
    removeItem,
    getJson,
    setJson,
    removeMany,
    collect,
    apply
  });
})();
