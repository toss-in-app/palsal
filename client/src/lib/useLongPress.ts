import { useRef, type PointerEvent } from 'react';

/** 길게 누름으로 볼 시간(아이폰 홈 화면 편집과 비슷하게) */
export const LONG_PRESS_MS = 500;
/** 손가락이 이만큼 움직이면 스크롤로 보고 취소해요 */
const MOVE_TOLERANCE = 8;

/**
 * 길게 누르면 onLongPress, 짧게 누르면 onPress. 길게 누른 뒤 따라오는 클릭은 삼켜요.
 * 끌기(드래그)로는 편집 모드에 들어가지 않아요 — 움직이면 취소(사용자 선호 '끌기로 모드 전환 금지').
 */
export function useLongPress(onLongPress: () => void, onPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onPress();
    },
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
}
