/**
 * 화면 날짜는 한국 날짜(YYYY-MM-DD)로 다뤄요. 장 시간 판단(한국 KST · 미국 ET)은 시세 기능과 함께(5단계).
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function kstDateKey(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** '2026-11-05' → '11월 5일 목요일' */
export function formatDateLabel(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WEEKDAYS[d.getUTCDay()]}요일`;
}
