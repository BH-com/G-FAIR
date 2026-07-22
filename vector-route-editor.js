(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";

  function query(selector, root = document) {
    return root.querySelector(selector);
  }

  function svgElement(tag, attrs = {}) {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value !== undefined && value !== null) element.setAttribute(name, String(value));
    }
    return element;
  }

  function normalizeSearch(value) {
    return String(value ?? "").toLowerCase().replace(/[\s-]/g, "");
  }

  function setText(element, value) {
    if (element) element.textContent = String(value ?? "");
    return element;
  }

  function clearElement(element) {
    if (element) element.replaceChildren();
    return element;
  }

  function createElement(tag, options = {}) {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = String(options.text);
    if (options.type) element.type = options.type;
    if (options.attributes) {
      for (const [name, value] of Object.entries(options.attributes)) {
        element.setAttribute(name, String(value));
      }
    }
    return element;
  }

  window.WayfindingUtils = Object.freeze({
    NS, query, svgElement, normalizeSearch, setText, clearElement, createElement
  });
})();
