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
    let pinchStartAngle = 0;
    let pinchStartViewBox = null;
    let rotationStartDegrees = 0;
    let rotationDegrees = 0;
    let gestureMoved = false;
    let suppressTapUntil = 0;
    let longPressTimer = 0;

    // 지도 앱의 일반적인 제스처 판별 방식:
    // - 짧고 정지된 입력만 탭
    // - 작더라도 같은 방향으로 이어지는 움직임은 드래그
    // - 오래 누르기는 탭으로 처리하지 않음
    // 손가락을 떼는 순간의 미세 흔들림은 탭으로 허용하되,
    // 실제 이동 의도가 보이면 일찍 드래그로 전환한다.
    const hardMoveThreshold = 12;
    const pathMoveThreshold = 20;
    const trendPathThreshold = 7;
    const longPressDuration = 400;
    const tapMaximumDuration = 520;
    const tapSuppressDuration = 500;
    const completedTouchLifetime = 700;
    const rotationDeadZoneDegrees = 1.2;

    const pointerAngle = (a, b) => Math.atan2(
      b.clientY - a.clientY,
      b.clientX - a.clientX
    ) * 180 / Math.PI;

    const normalizeAngleDelta = (value) => {
      let angle = value;
      while (angle > 180) angle -= 360;
      while (angle < -180) angle += 360;
      return angle;
    };

    function applyRotation(nextDegrees = rotationDegrees) {
      rotationDegrees = Number.isFinite(nextDegrees) ? nextDegrees : 0;
      svg.style.transformOrigin = "50% 50%";
      svg.style.transformBox = "fill-box";
      svg.style.willChange = "transform";
      svg.style.transform = `rotate(${rotationDegrees}deg)`;
      svg.dataset.rotationDegrees = String(rotationDegrees);
      return rotationDegrees;
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

    function startPan(event) {
      try { svg.setPointerCapture(event.pointerId); } catch {}
      pointers.set(event.pointerId, event);
      pointerTracks.set(event.pointerId, createTrack(event));
      svg.classList.add("dragging");

      if (pointers.size >= 2) {
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
        pinchStartAngle = pointerAngle(a, b);
        rotationStartDegrees = rotationDegrees;
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

      updateMovementIntent(event);
      pointers.set(event.pointerId, event);
      const current = getViewBox();
      const full = getFullViewBox();

      if (pointers.size === 1 && dragStart && (current.width < full.width || current.height < full.height)) {
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const screenDx = (event.clientX - dragStart.clientX) / rect.width * dragStart.viewBox.width;
        const screenDy = (event.clientY - dragStart.clientY) / rect.height * dragStart.viewBox.height;
        const radians = -rotationDegrees * Math.PI / 180;
        const dx = screenDx * Math.cos(radians) - screenDy * Math.sin(radians);
        const dy = screenDx * Math.sin(radians) + screenDy * Math.cos(radians);
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
        const currentAngle = pointerAngle(a, b);
        const angleDelta = normalizeAngleDelta(currentAngle - pinchStartAngle);
        if (Math.abs(angleDelta) >= rotationDeadZoneDegrees) {
          applyRotation(rotationStartDegrees + angleDelta);
        }
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
        pinchStartDistance = 0;
        pinchStartAngle = 0;
        rotationStartDegrees = rotationDegrees;
        suppressTap();
      } else if (pointers.size === 0) {
        dragStart = null;
        pinchStartViewBox = null;
        pinchStartDistance = 0;
        pinchStartAngle = 0;
        rotationStartDegrees = rotationDegrees;
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
      getRotation() {
        return rotationDegrees;
      },
      setRotation(degrees) {
        return applyRotation(Number(degrees) || 0);
      },
      resetRotation() {
        return applyRotation(0);
      },
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
        pinchStartAngle = 0;
        rotationStartDegrees = rotationDegrees;
        gestureMoved = false;
        suppressTapUntil = 0;
        svg.classList.remove("dragging");
      },
      destroy() {
        for (const [target, type, handler, settings] of listeners) {
          target.removeEventListener(type, handler, settings);
        }
        api.resetInteraction();
      }
    };

    applyRotation(0);
    return api;
  }

  window.MapViewportController = Object.freeze({ create });
})();
