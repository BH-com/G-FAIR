(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  function create(options = {}) {
    const svg = options.svg;
    if (!svg) throw new Error("MapViewportController: svg element is required.");

    const getFullViewBox = options.getFullViewBox;
    const getViewBox = options.getViewBox;
    const setViewBox = options.setViewBox;
    const hooks = options.hooks || {};

    if (typeof getFullViewBox !== "function" || typeof getViewBox !== "function" || typeof setViewBox !== "function") {
      throw new Error("MapViewportController: viewBox accessors are required.");
    }

    const pointers = new Map();
    const pointerStarts = new Map();
    let dragStart = null;
    let pinchStartDistance = 0;
    let pinchStartViewBox = null;
    let gestureMoved = false;
    let suppressTapUntil = 0;
    const gestureThreshold = 8;
    const tapSuppressDuration = 450;

    function normalized(box) {
      const full = getFullViewBox();
      const width = clamp(Number(box.width) || full.width, 1, full.width);
      const height = clamp(Number(box.height) || full.height, 1, full.height);
      return {
        x: clamp(Number(box.x) || 0, full.x, full.x + full.width - width),
        y: clamp(Number(box.y) || 0, full.y, full.y + full.height - height),
        width,
        height
      };
    }

    function apply(box = getViewBox()) {
      const next = normalized(box);
      setViewBox(next);
      svg.setAttribute("viewBox", `${next.x} ${next.y} ${next.width} ${next.height}`);
      return next;
    }

    function fit() {
      return apply({ ...getFullViewBox() });
    }

    function zoom(factor, centerX, centerY) {
      const full = getFullViewBox();
      const current = getViewBox();
      const cx = Number.isFinite(centerX) ? centerX : current.x + current.width / 2;
      const cy = Number.isFinite(centerY) ? centerY : current.y + current.height / 2;
      const minimumWidth = full.width * 0.08;
      const nextWidth = clamp(current.width * factor, minimumWidth, full.width);
      const aspect = full.height / full.width;
      const nextHeight = clamp(nextWidth * aspect, minimumWidth * aspect, full.height);
      const ratioX = nextWidth / current.width;
      const ratioY = nextHeight / current.height;

      return apply({
        x: cx - (cx - current.x) * ratioX,
        y: cy - (cy - current.y) * ratioY,
        width: nextWidth,
        height: nextHeight
      });
    }

    function clientToSvg(clientX, clientY) {
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const matrix = svg.getScreenCTM();
      if (!matrix) return { x: clientX, y: clientY };
      const result = point.matrixTransform(matrix.inverse());
      return { x: result.x, y: result.y };
    }

    function startPan(event) {
      try { svg.setPointerCapture(event.pointerId); } catch {}
      pointers.set(event.pointerId, event);
      pointerStarts.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY
      });
      svg.classList.add("dragging");

      if (pointers.size >= 2) {
        gestureMoved = true;
        suppressTapUntil = Math.max(suppressTapUntil, performance.now() + tapSuppressDuration);
      }

      if (pointers.size === 1) {
        dragStart = {
          clientX: event.clientX,
          clientY: event.clientY,
          viewBox: { ...getViewBox() }
        };
        pinchStartViewBox = null;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStartDistance = distance(a, b);
        pinchStartViewBox = { ...getViewBox() };
        dragStart = null;
      }
    }

    function onPointerDown(event) {
      if (hooks.pointerDown?.(event, api) === true) return;
      startPan(event);
    }

    function onPointerMove(event) {
      if (hooks.pointerMove?.(event, api) === true) return;
      if (!pointers.has(event.pointerId)) return;

      const previous = pointers.get(event.pointerId);
      pointers.set(event.pointerId, event);
      if (previous && Math.hypot(event.clientX - previous.clientX, event.clientY - previous.clientY) >= gestureThreshold) {
        gestureMoved = true;
        suppressTapUntil = Math.max(suppressTapUntil, performance.now() + tapSuppressDuration);
      }
      const current = getViewBox();
      const full = getFullViewBox();

      if (pointers.size === 1 && dragStart && (current.width < full.width || current.height < full.height)) {
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const dx = (event.clientX - dragStart.clientX) / rect.width * dragStart.viewBox.width;
        const dy = (event.clientY - dragStart.clientY) / rect.height * dragStart.viewBox.height;
        apply({
          ...dragStart.viewBox,
          x: dragStart.viewBox.x - dx,
          y: dragStart.viewBox.y - dy
        });
        return;
      }

      if (pointers.size === 2 && pinchStartViewBox && pinchStartDistance > 0) {
        const [a, b] = [...pointers.values()];
        const currentDistance = distance(a, b);
        if (currentDistance <= 0) return;
        const midpoint = {
          clientX: (a.clientX + b.clientX) / 2,
          clientY: (a.clientY + b.clientY) / 2
        };
        const center = clientToSvg(midpoint.clientX, midpoint.clientY);
        setViewBox({ ...pinchStartViewBox });
        zoom(pinchStartDistance / currentDistance, center.x, center.y);
      }
    }

    function onPointerEnd(event) {
      if (hooks.pointerEnd?.(event, api) === true) return;
      if (gestureMoved || pointers.size >= 2) {
        suppressTapUntil = Math.max(suppressTapUntil, performance.now() + tapSuppressDuration);
      }
      pointers.delete(event.pointerId);

      if (pointers.size === 1) {
        const remaining = [...pointers.values()][0];
        dragStart = {
          clientX: remaining.clientX,
          clientY: remaining.clientY,
          viewBox: { ...getViewBox() }
        };
        pinchStartViewBox = null;
      } else if (pointers.size === 0) {
        dragStart = null;
        pinchStartViewBox = null;
        pinchStartDistance = 0;
        gestureMoved = false;
        svg.classList.remove("dragging");
      }
    }

    function onWheel(event) {
      event.preventDefault();
      const center = clientToSvg(event.clientX, event.clientY);
      zoom(event.deltaY < 0 ? 0.85 : 1.18, center.x, center.y);
    }

    const listeners = [
      [svg, "wheel", onWheel, { passive: false }],
      [svg, "pointerdown", onPointerDown, { capture: true }],
      [svg, "pointermove", onPointerMove, { capture: true }],
      [svg, "pointerup", onPointerEnd, { capture: true }],
      [svg, "pointercancel", onPointerEnd, { capture: true }]
    ];

    for (const [target, type, handler, settings] of listeners) {
      target.addEventListener(type, handler, settings);
    }

    const api = {
      apply,
      fit,
      zoom,
      clientToSvg,
      shouldSuppressTap() {
        return performance.now() < suppressTapUntil || pointers.size > 1;
      },
      resetInteraction() {
        pointers.clear();
        pointerStarts.clear();
        dragStart = null;
        pinchStartViewBox = null;
        pinchStartDistance = 0;
        gestureMoved = false;
        suppressTapUntil = 0;
        svg.classList.remove("dragging");
        gestureMoved = false;
      },
      destroy() {
        for (const [target, type, handler, settings] of listeners) {
          target.removeEventListener(type, handler, settings);
        }
        api.resetInteraction();
      }
    };

    return api;
  }

  window.MapViewportController = Object.freeze({ create });
})();
