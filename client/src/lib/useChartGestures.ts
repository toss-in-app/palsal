import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import { indexAt, panView, pinchView, zoomView, type ChartView } from './chartView';

/** 이만큼 누르고 있으면 그 봉의 값을 보여 줘요(증권 앱처럼 누른 채 옆으로 옮기면 따라가요) */
export const HOLD_MS = 320;
/** 손가락이 이만큼 움직이면 밀기로 봐요 */
const SLOP = 6;

export interface ChartGestureOptions {
  /** 봉 수 */
  n: number;
  /** 그래프 영역 — 요소 왼쪽에서 떨어진 거리와 폭(px) */
  plot: { left: number; width: number };
  getView: () => ChartView;
  setView: (v: ChartView) => void;
  /** 값을 볼 봉. hold = 누르고 있는 동안(옮기면 따라감), clear = 손을 뗐거나 밀기·벌리기를 시작해서 숨김. 짧게 누르기는 아무것도 안 해요 */
  onPoint: (index: number | null, how: 'hold' | 'clear') => void;
}

/**
 * 차트 손짓 — 한 손가락으로 옆으로 밀기(놓으면 조금 더 미끄러짐) · 두 손가락으로 벌리기/오므리기 · 누르고 있기(떼면 원래대로).
 * 짧게 누르기는 아무것도 바꾸지 않아요(사용자 2026-11-06: 누르면 값이 바뀌어 있는 게 문제).
 * 화면 안의 차트라 위아래로 미는 건 화면 스크롤에 맡겨요: 요소에 touch-action: pan-y, 위아래로 먼저 움직이면 손대지 않아요.
 * 마우스 휠(PC)은 위아래면 화면 스크롤, 옆으로 밀면 차트 밀기, Ctrl(트랙패드 벌리기)이면 크게/작게.
 */
export function useChartGestures(ref: RefObject<HTMLElement | null>, options: ChartGestureOptions): void {
  const opts = useRef(options);
  useLayoutEffect(() => {
    opts.current = options;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let mode: 'idle' | 'press' | 'pan' | 'pinch' | 'hold' = 'idle';
    let down = { x: 0, y: 0 };
    let lastX = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pinch: { view: ChartView; from: number; dist: number } | null = null;
    let samples: { x: number; t: number }[] = [];
    let raf = 0;

    const frac = (clientX: number) => {
      const { left, width } = opts.current.plot;
      return width > 0 ? (clientX - el.getBoundingClientRect().left - left) / width : 0;
    };
    const stopTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const stopFling = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const pan = (dx: number) => {
      const { n, plot, getView, setView } = opts.current;
      setView(panView(getView(), dx, plot.width, n));
    };
    const pointAt = (clientX: number) => {
      const { getView, n, onPoint } = opts.current;
      onPoint(indexAt(getView(), frac(clientX), n), 'hold');
    };
    /** 놓은 뒤 미끄러짐 — 속도(px/ms)를 조금씩 줄여요. 끝에 닿으면 멈춰요 */
    const fling = (v0: number) => {
      let v = v0;
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(34, Math.max(0, now - last));
        last = now;
        const before = opts.current.getView().end;
        pan(v * dt);
        v *= Math.pow(0.94, dt / 16);
        raf = Math.abs(v) > 0.03 && opts.current.getView().end !== before ? requestAnimationFrame(step) : 0;
      };
      raf = requestAnimationFrame(step);
    };
    const twoFingers = () => {
      const [a, b] = [...pointers.values()];
      return { mid: (a.x + b.x) / 2, dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // 그림 위에 띄운 버튼(최근으로)은 그냥 눌려요
      if (e.target instanceof Element && e.target.closest('button')) return;
      stopFling();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 흉내 낸 포인터 등 */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        mode = 'press';
        down = { x: e.clientX, y: e.clientY };
        lastX = e.clientX;
        samples = [{ x: e.clientX, t: e.timeStamp }];
        stopTimer();
        timer = setTimeout(() => {
          timer = null;
          if (mode !== 'press') return;
          mode = 'hold';
          pointAt(down.x);
        }, HOLD_MS);
      } else if (pointers.size === 2) {
        stopTimer();
        if (mode !== 'pinch') opts.current.onPoint(null, 'clear');
        mode = 'pinch';
        const { mid, dist } = twoFingers();
        pinch = { view: opts.current.getView(), from: frac(mid), dist };
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (mode === 'pinch') {
        if (!pinch || pointers.size < 2) return;
        const { mid, dist } = twoFingers();
        opts.current.setView(pinchView(pinch.view, pinch.from, frac(mid), dist / pinch.dist, opts.current.n));
        return;
      }
      if (mode === 'hold') {
        pointAt(e.clientX);
        return;
      }
      if (mode === 'press' && Math.hypot(e.clientX - down.x, e.clientY - down.y) > SLOP) {
        stopTimer();
        // 위아래로 먼저 움직이면 화면 스크롤 — 브라우저가 가져가게 놔둬요
        if (Math.abs(e.clientY - down.y) > Math.abs(e.clientX - down.x)) {
          mode = 'idle';
          pointers.delete(e.pointerId);
          return;
        }
        mode = 'pan';
        opts.current.onPoint(null, 'clear');
      }
      if (mode === 'pan') {
        pan(e.clientX - lastX);
        lastX = e.clientX;
        samples.push({ x: e.clientX, t: e.timeStamp });
        while (samples.length > 2 && e.timeStamp - samples[0].t > 100) samples.shift();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (mode === 'pinch') {
        pinch = null;
        if (pointers.size === 1) {
          // 한 손가락을 먼저 떼면 남은 손가락으로 이어서 밀어요
          mode = 'pan';
          lastX = [...pointers.values()][0].x;
          samples = [];
        } else if (pointers.size === 0) mode = 'idle';
        return;
      }
      if (pointers.size > 0) return;
      stopTimer();
      // 누르고 있다 떼면 값 보기가 끝나요(짧게 누른 건 아무것도 안 해요)
      if (mode === 'hold') opts.current.onPoint(null, 'clear');
      else if (mode === 'pan' && e.type === 'pointerup' && samples.length >= 2) {
        const a = samples[0];
        const b = samples[samples.length - 1];
        const v = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
        // 손가락을 멈췄다 떼면 미끄러지지 않아요
        if (Math.abs(v) > 0.25 && e.timeStamp - b.t < 60) fling(v);
      }
      mode = 'idle';
    };
    const onWheel = (e: WheelEvent) => {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      // 그냥 위아래 휠은 화면 스크롤
      if (!sideways && !e.ctrlKey) return;
      e.preventDefault();
      stopFling();
      const { n, plot, getView, setView, onPoint } = opts.current;
      onPoint(null, 'clear');
      if (sideways) setView(panView(getView(), -e.deltaX, plot.width, n));
      else setView(zoomView(getView(), Math.exp(-e.deltaY * 0.01), Math.min(1, Math.max(0, frac(e.clientX))), n));
    };
    const block = (e: Event) => e.preventDefault();
    // 차트를 밀거나 벌리거나 값을 보는 동안만 화면이 따라 움직이지 않게(그 밖엔 위아래 스크롤 그대로)
    const blockWhileActive = (e: Event) => {
      if ((mode === 'pan' || mode === 'pinch' || mode === 'hold') && e.cancelable) e.preventDefault();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    // iOS: 손가락 두 개가 페이지 확대로, 차트 밀기가 화면 스크롤로 새지 않게
    el.addEventListener('touchmove', blockWhileActive, { passive: false });
    el.addEventListener('gesturestart', block);
    el.addEventListener('contextmenu', block);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', blockWhileActive);
      el.removeEventListener('gesturestart', block);
      el.removeEventListener('contextmenu', block);
      stopTimer();
      stopFling();
    };
  }, [ref]);
}
