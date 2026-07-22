(() => {
  "use strict";
  const { clearElement, createElement } = window.WayfindingUtils;

  function renderSearchResults(container, items, onSelect) {
    clearElement(container);
    if (!items.length) {
      container.append(createElement("p", { className: "hint", text: "검색 결과가 없습니다." }));
      return;
    }
    for (const item of items) {
      const button = createElement("button", { className: "result-item", type: "button" });
      button.append(
        createElement("strong", { text: item.name || item.id }),
        createElement("span", { text: `${item.booth || item.id} · ${item.category || "부스"}` })
      );
      button.addEventListener("click", () => onSelect(item));
      container.append(button);
    }
  }

  function renderManagedLocations(container, items, selectedCode = null, onSelect = null) {
    clearElement(container);
    if (!items.length) {
      container.append(createElement("p", { className: "hint", text: "등록된 위치가 없습니다." }));
      return;
    }
    for (const item of items) {
      const row = createElement("div", { className: "admin-location-item" });
      if (item.code === selectedCode) row.classList.add("selected");
      if (onSelect) row.addEventListener("click", () => onSelect(item));
      const summary = createElement("div", { className: "admin-location-summary" });
      summary.append(
        createElement("strong", { text: item.name }),
        createElement("span", { text: item.code })
      );
      const actions = createElement("div", { className: "admin-location-actions" });
      const edit = createElement("button", { type: "button", text: "이름 수정", attributes: { "data-edit-location": item.code } });
      const remove = createElement("button", { type: "button", text: "삭제", attributes: { "data-delete-location": item.code } });
      actions.append(edit, remove);
      row.append(summary, actions);
      container.append(row);
    }
  }

  function renderAnalysis(container, parsed) {
    clearElement(container);
    const heading = createElement("strong", { text: "분석 완료" });
    const dl = document.createElement("dl");
    const pairs = [
      ["시트", parsed.sheetName],
      ["격자", `${parsed.cols} × ${parsed.rows}칸`],
      ["인식 부스", `${parsed.stats.boothCount}개`],
      ["이동 가능 복도", `${parsed.stats.walkableCount.toLocaleString()}㎡`],
      ["다중 영역 부스", `${parsed.stats.duplicateShapeCount}개`],
      ["출입면 없음", `${parsed.stats.noEntrance.length}개`]
    ];
    for (const [term, desc] of pairs) {
      const wrap = document.createElement("div");
      wrap.append(createElement("dt", { text: term }), createElement("dd", { text: desc }));
      dl.append(wrap);
    }
    container.append(heading, dl);
    if (parsed.stats.noEntrance.length) {
      const suffix = parsed.stats.noEntrance.length > 20 ? " 외" : "";
      container.append(createElement("p", {
        className: "analysis-warning",
        text: `확인 필요: ${parsed.stats.noEntrance.slice(0, 20).join(", ")}${suffix}`
      }));
    }
  }

  window.WayfindingRenderers = Object.freeze({ renderSearchResults, renderManagedLocations, renderAnalysis });
})();
