/** 차트 글자 도우미 — 카드 차트(PriceChart)와 자세히의 움직이는 차트(ChartPanels)가 함께 써요 */

/** 눈금 글자(11px) 한 자 폭 어림 — 쉼표·점은 좁게 */
export const textWidth = (s: string) => [...s].reduce((w, ch) => w + (ch === ',' || ch === '.' ? 3 : 6.6), 0);

/** 오른쪽 가격 눈금 글자: 100 이상 정수 · 1 이상 소수 둘째 · 그 아래 넷째 자리 */
export function axisText(v: number): string {
  const a = Math.abs(v);
  const d = a >= 100 ? 0 : a >= 1 ? 2 : 4;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
