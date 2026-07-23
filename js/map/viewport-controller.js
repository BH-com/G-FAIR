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
    const pointerTracks = new Map();
    const completedTouches = new Map();
    let dragStart = null;
    let pinchStartDistance = 0;
    let pinchStartViewBox = null;
    let gestureMoved = false;
    let suppressTapUntil = 0;
    let longPressTimer = 0;
    let rotationDegrees = 0;
    let tiltDegrees = 0;
    const rotationStep = 15;
    const tiltStep = 15;
    const maximumTilt = 45;

    // 지도 앱의 일반적인 제스처 판별 방식:
    // - 짧고 정지된 입력만 탭
    // - 작더라도 같은 방향으로 이어지는 움직임은 드래그
    // - 오래 누르기는 탭으로 처리하지 않음
    // 손가락을 떼는 순간의 미세 흔들림은 탭으로 허용하되,
    // 실제 이동 의도가 보이면 일찍 드래그로 전환한다.
    const hardMoveThreshold = 12;
    const pathMoveThreshold = 20;
    const trendPathThreshold = 7;
    const longPressDuration = 600;
    const tapMaximumDuration = 520;
    const tapSuppressDuration = 80;
    const completedTouchLifetime = 700;

    function normalizeAngle(value) {
      let angle = Number(value) || 0;
      angle %= 360;
      if (angle > 180) angle -= 360;
      if (angle <= -180) angle += 360;
      return angle;
    }

    function isDrawableSvgNode(node) {
      if (!(node instanceof Element)) return false;
      const tag = node.tagName.toLowerCase();
      return tag !== "defs" && tag !== "style" && tag !== "title" && tag !== "desc";
    }

    function transformSafetyScale() {
      const normalizedRotation = Math.abs(rotationDegrees % 90);
      const acuteRotation = Math.min(normalizedRotation, 90 - normalizedRotation);
      const rotationLoss = Math.sin((acuteRotation / 45) * Math.PI / 2) * 0.12;
      const tiltLoss = (tiltDegrees / maximumTilt) * 0.12;
      return clamp(1 - rotationLoss - tiltLoss, 0.76, 1);
    }

    function applyMapTransform() {
      const hasTransform = rotationDegrees !== 0 || tiltDegrees !== 0;
      const safetyScale = transformSafetyScale();
      const transformValue = hasTransform
        ? `perspective(1400px) rotateX(${tiltDegrees}deg) rotateZ(${rotationDegrees}deg) scale(${safetyScale})`
        : "";

      svg.style.transform = "";
      svg.style.transformOrigin = "";
      svg.style.transformBox = "";
      svg.style.willChange = "";

      for (const child of [...svg.children]) {
        if (!isDrawableSvgNode(child)) continue;
        child.style.transformOrigin = "center center";
        child.style.transformBox = "fill-box";
        child.style.transformStyle = "preserve-3d";
        child.style.willChange = hasTransform ? "transform" : "";
        child.style.transform = transformValue;
      }

      const sampleLayer = svg.querySelector("#sampleMapLayer");
      if (sampleLayer) sampleLayer.style.display = "none";

      svg.dataset.rotationDegrees = String(rotationDegrees);
      svg.dataset.tiltDegrees = String(tiltDegrees);

      const rotationLabel = document.querySelector("#mapRotationValue");
      if (rotationLabel) rotationLabel.textContent = `${Math.round(rotationDegrees)}°`;
      const tiltLabel = document.querySelector("#mapTiltValue");
      if (tiltLabel) tiltLabel.textContent = `${Math.round(tiltDegrees)}°`;
    }

    function applyRotation(value = rotationDegrees) {
      rotationDegrees = normalizeAngle(value);
      applyMapTransform();
      return rotationDegrees;
    }

    function applyTilt(value = tiltDegrees) {
      tiltDegrees = clamp(Number(value) || 0, 0, maximumTilt);
      applyMapTransform();
      return tiltDegrees;
    }

    function rotateBy(delta) {
      return applyRotation(rotationDegrees + Number(delta || 0));
    }

    function tiltBy(delta) {
      return applyTilt(tiltDegrees + Number(delta || 0));
    }

    function resetTransform() {
      rotationDegrees = 0;
      tiltDegrees = 0;
      applyMapTransform();
    }

    function resetRotation() {
      return applyRotation(0);
    }

    function resetTilt() {
      return applyTilt(0);
    }

    function ensureRotationControls() {
      const actions = document.querySelector(".map-actions");
      if (!actions || document.querySelector("#rotateLeftBtn")) return;

      const left = document.createElement("button");
      left.id = "rotateLeftBtn";
      left.type = "button";
      left.setAttribute("aria-label", "지도 왼쪽 회전");
      left.title = "왼쪽으로 15° 회전";
      left.textContent = "↶";

      const value = document.createElement("button");
      value.id = "mapRotationValue";
      value.type = "button";
      value.setAttribute("aria-label", "지도 회전 초기화");
      value.title = "회전 원위치";
      value.textContent = "0°";

      const right = document.createElement("button");
      right.id = "rotateRightBtn";
      right.type = "button";
      right.setAttribute("aria-label", "지도 오른쪽 회전");
      right.title = "오른쪽으로 15° 회전";
      right.textContent = "↷";

      const tiltDown = document.createElement("button");
      tiltDown.id = "tiltDownBtn";
      tiltDown.type = "button";
      tiltDown.setAttribute("aria-label", "지도 기울기 줄이기");
      tiltDown.title = "기울기 15° 줄이기";
      tiltDown.textContent = "평면";

      const tiltValue = document.createElement("button");
      tiltValue.id = "mapTiltValue";
      tiltValue.type = "button";
      tiltValue.setAttribute("aria-label", "지도 기울기 초기화");
      tiltValue.title = "기울기 원위치";
      tiltValue.textContent = "0°";

      const tiltUp = document.createElement("button");
      tiltUp.id = "tiltUpBtn";
      tiltUp.type = "button";
      tiltUp.setAttribute("aria-label", "지도 기울기 늘리기");
      tiltUp.title = "기울기 15° 늘리기 (최대 45°)";
      tiltUp.textContent = "입체";

      actions.append(left, value, right, tiltDown, tiltValue, tiltUp);
      left.addEventListener("click", () => rotateBy(-rotationStep));
      value.addEventListener("click", resetRotation);
      right.addEventListener("click", () => rotateBy(rotationStep));
      tiltDown.addEventListener("click", () => tiltBy(-tiltStep));
      tiltValue.addEventListener("click", resetTilt);
      tiltUp.addEventListener("click", () => tiltBy(tiltStep));
    }

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

    function clearLongPressTimer() {
      if (!longPressTimer) return;
      clearTimeout(longPressTimer);
      longPressTimer = 0;
    }

    function suppressTap() {
      gestureMoved = true;
      suppressTapUntil = Math.max(suppressTapUntil, performance.now() + tapSuppressDuration);
      clearLongPressTimer();
    }

    function rememberCompletedTouch(pointerId, tapEligible) {
      const now = performance.now();
      completedTouches.set(pointerId, {
        tapEligible: Boolean(tapEligible),
        expiresAt: now + completedTouchLifetime
      });
      window.setTimeout(() => {
        const entry = completedTouches.get(pointerId);
        if (entry && entry.expiresAt <= performance.now()) {
          completedTouches.delete(pointerId);
        }
      }, completedTouchLifetime + 40);
    }

    function createTrack(event) {
      return {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: event.timeStamp || performance.now(),
        downTime: performance.now(),
        pathLength: 0,
        maxDisplacement: 0,
        moveSamples: 0,
        trendScore: 0,
        lastVectorX: 0,
        lastVectorY: 0,
        cancelled: false,
        multiTouch: false
      };
    }

    function updateMovementIntent(event) {
      const track = pointerTracks.get(event.pointerId);
      if (!track) return false;

      const now = event.timeStamp || performance.now();
      const stepX = event.clientX - track.lastX;
      const stepY = event.clientY - track.lastY;
      const step = Math.hypot(stepX, stepY);
      const elapsed = Math.max(1, now - track.lastTime);

      if (step >= 0.35) {
        track.pathLength += step;
        track.moveSamples += 1;

        const previousLength = Math.hypot(track.lastVectorX, track.lastVectorY);
        if (previousLength > 0.25) {
          const cosine = (stepX * track.lastVectorX + stepY * track.lastVectorY) / (step * previousLength);
          if (cosine > 0.55) track.trendScore += 1;
          else if (cosine < -0.1) track.trendScore = Math.max(0, track.trendScore - 1);
        }

        track.lastVectorX = stepX;
        track.lastVectorY = stepY;
        track.lastX = event.clientX;
        track.lastY = event.clientY;
        track.lastTime = now;
      }

      const displacement = Math.hypot(
        event.clientX - track.startX,
        event.clientY - track.startY
      );
      track.maxDisplacement = Math.max(track.maxDisplacement, displacement);
      const velocity = step / elapsed;

      // 큰 이동뿐 아니라 작더라도 같은 방향으로 이어지는 움직임을
      // 사용자의 드래그 의도로 판단한다. 손 떨림처럼 방향이 제각각인
      // 미세 움직임은 탭 후보로 남긴다.
      const hasDirectionalTrend =
        track.moveSamples >= 3 &&
        track.trendScore >= 2 &&
        track.pathLength >= trendPathThreshold &&
        displacement >= 5;

      const hasFastIntent = velocity >= 0.11 && track.pathLength >= 6 && displacement >= 4;
      const moved =
        displacement >= hardMoveThreshold ||
        track.pathLength >= pathMoveThreshold ||
        hasDirectionalTrend ||
        hasFastIntent;

      if (moved) {
        track.cancelled = true;
        suppressTap();
      }
      return moved;
    }

    function capturePointer(pointerId) {
      try { svg.setPointerCapture(pointerId); } catch {}
    }

    function startPan(event) {
      // 정지된 클릭/탭은 원래 부스 요소에서 pointerup이 발생해야 한다.
      // pointerdown 즉시 SVG가 포인터를 가로채면 PC click 대상이 SVG로 바뀌고,
      // 확대 직후 모바일의 첫 탭도 유실될 수 있으므로 실제 이동이 시작된 뒤 캡처한다.
      pointers.set(event.pointerId, event);
      pointerTracks.set(event.pointerId, createTrack(event));
      svg.classList.add("dragging");

      if (pointers.size >= 2) {
        for (const pointerId of pointers.keys()) capturePointer(pointerId);
        for (const track of pointerTracks.values()) {
          track.cancelled = true;
          track.multiTouch = true;
        }
        suppressTap();
      } else {
        clearLongPressTimer();
        longPressTimer = setTimeout(() => {
          // 지도에서는 오래 누르기를 선택으로 해석하지 않는다.
          // 정지 상태라도 일정 시간을 넘기면 탭 후보를 취소한다.
          if (pointers.size === 1) {
            const activeTrack = pointerTracks.values().next().value;
            if (activeTrack) activeTrack.cancelled = true;
            suppressTap();
          }
        }, longPressDuration);
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

      const moved = updateMovementIntent(event);
      if (moved) capturePointer(event.pointerId);
      pointers.set(event.pointerId, event);
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
        suppressTap();
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

      const track = pointerTracks.get(event.pointerId);
      const pointerCountBeforeEnd = pointers.size;
      const now = performance.now();
      let tapEligible = false;

      if (track) {
        const heldFor = now - track.downTime;
        const endDisplacement = Math.hypot(
          event.clientX - track.startX,
          event.clientY - track.startY
        );

        // 선택은 pointerdown이나 native click에서 하지 않고 오직 pointerup에서만 확정한다.
        // 짧고 정지된 단일 터치만 탭이며, 이동 경향·장시간 누름·멀티터치는 모두 취소한다.
        tapEligible =
          event.type === "pointerup" &&
          event.pointerType === "touch" &&
          pointerCountBeforeEnd === 1 &&
          !track.cancelled &&
          !track.multiTouch &&
          heldFor <= tapMaximumDuration &&
          endDisplacement < hardMoveThreshold &&
          track.maxDisplacement < hardMoveThreshold &&
          track.pathLength < pathMoveThreshold;

        if (!tapEligible) {
          track.cancelled = true;
          suppressTapUntil = Math.max(suppressTapUntil, now + tapSuppressDuration);
        }
        rememberCompletedTouch(event.pointerId, tapEligible);
      }

      pointers.delete(event.pointerId);
      pointerTracks.delete(event.pointerId);
      clearLongPressTimer();

      if (pointers.size === 1) {
        const remaining = [...pointers.values()][0];
        const remainingTrack = pointerTracks.get(remaining.pointerId);
        if (remainingTrack) {
          remainingTrack.cancelled = true;
          remainingTrack.multiTouch = true;
        }
        dragStart = {
          clientX: remaining.clientX,
          clientY: remaining.clientY,
          viewBox: { ...getViewBox() }
        };
        pinchStartViewBox = null;
        suppressTap();
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

    function onKeyDown(event) {
      if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        rotateBy(event.shiftKey ? -rotationStep : rotationStep);
      } else if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        tiltBy(event.shiftKey ? -tiltStep : tiltStep);
      } else if (event.key === "0") {
        event.preventDefault();
        resetTransform();
      }
    }

    const transformObserver = new MutationObserver(() => applyMapTransform());
    transformObserver.observe(svg, { childList: true });

    ensureRotationControls();
    resetTransform();

    const listeners = [
      [svg, "wheel", onWheel, { passive: false }],
      [svg, "pointerdown", onPointerDown, { capture: true }],
      [svg, "pointermove", onPointerMove, { capture: true }],
      [svg, "pointerup", onPointerEnd, { capture: true }],
      [svg, "pointercancel", onPointerEnd, { capture: true }],
      [window, "keydown", onKeyDown, false]
    ];

    for (const [target, type, handler, settings] of listeners) {
      target.addEventListener(type, handler, settings);
    }

    const api = {
      apply,
      fit,
      zoom,
      clientToSvg,
      rotateBy,
      resetRotation,
      setRotation: applyRotation,
      getRotation() {
        return rotationDegrees;
      },
      tiltBy,
      resetTilt,
      setTilt: applyTilt,
      getTilt() {
        return tiltDegrees;
      },
      resetTransform,
      shouldSuppressTap() {
        return performance.now() < suppressTapUntil || pointers.size > 1;
      },
      consumeTouchTap(pointerId) {
        const entry = completedTouches.get(pointerId);
        if (!entry) return false;
        completedTouches.delete(pointerId);
        return entry.tapEligible && entry.expiresAt > performance.now();
      },
      isInteracting() {
        return pointers.size > 0;
      },
      resetInteraction() {
        pointers.clear();
        pointerTracks.clear();
        completedTouches.clear();
        clearLongPressTimer();
        dragStart = null;
        pinchStartViewBox = null;
        pinchStartDistance = 0;
        gestureMoved = false;
        suppressTapUntil = 0;
        svg.classList.remove("dragging");
      },
      destroy() {
        for (const [target, type, handler, settings] of listeners) {
          target.removeEventListener(type, handler, settings);
        }
        api.resetInteraction();
        transformObserver.disconnect();
        svg.style.transform = "";
        svg.style.willChange = "";
        for (const child of [...svg.children]) {
          if (!isDrawableSvgNode(child)) continue;
          child.style.transform = "";
          child.style.transformOrigin = "";
          child.style.transformBox = "";
          child.style.transformStyle = "";
          child.style.willChange = "";
        }
        delete svg.dataset.rotationDegrees;
        delete svg.dataset.tiltDegrees;
      }
    };

    return api;
  }

  window.MapViewportController = Object.freeze({ create });
})();
