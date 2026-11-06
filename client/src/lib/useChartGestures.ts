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
  /** 값을 볼 봉. tap = 짧게 누름, hold = 길게 누른 채 옮김, clear = 밀기·벌리기를 시작해서 숨김 */
  onPoint: (index: number | null, how: 'tap' | 'hold' | 'clear') => void;
}

/**
 * 차트 손짓 — 한 손가락으로 밀기(놓으면 조금 더 미끄러짐) · 두 손가락으로 벌리기/오므리기 · 길게 누르기 · 짧게 누르기.
 * 마우스 휠(개발·PC)은 위아래 = 크게/작게, 옆 = 밀기. 포인터 이벤트로 받고, 요소에 touch-action: none 을 둬야 해요.
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
    const pointAt = (clientX: number, how: 'tap' | 'hold') => {
      const { getView, n, onPoint } = opts.current;
      onPoint(indexAt(getView(), frac(clientX), n), how);
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
          pointAt(down.x, 'hold');
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
        pointAt(e.clientX, 'hold');
        return;
      }
      if (mode === 'press' && Math.hypot(e.clientX - down.x, e.clientY - down.y) > SLOP) {
        stopTimer();
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
      if (mode === 'press' && e.type === 'pointerup') pointAt(e.clientX, 'tap');
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
      e.preventDefault();
      stopFling();
      const { n, plot, getView, setView, onPoint } = opts.current;
      onPoint(null, 'clear');
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) setView(panView(getView(), -e.deltaX, plot.width, n));
      else setView(zoomView(getView(), Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), Math.min(1, Math.max(0, frac(e.clientX))), n));
    };
    const block = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    // iOS: 손가락 두 개가 페이지 확대로, 밀기가 뒤 화면 스크롤로 새지 않게
    el.addEventListener('touchmove', block, { passive: false });
    el.addEventListener('gesturestart', block);
    el.addEventListener('contextmenu', block);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', block);
      el.removeEventListener('gesturestart', block);
      el.removeEventListener('contextmenu', block);
      stopTimer();
      stopFling();
    };
  }, [ref]);
}
