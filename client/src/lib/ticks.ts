/**
 * 세로 눈금: 1·2·5 × 10ⁿ 간격의 둥근 값으로 3~5개(0.2·0.5·0.8 자리의 어중간한 값 대신).
 * 간격은 '범위 ÷ 목표 개수'를 1·2·5·10 중 가까운 값으로 반올림해 골라요(1.5 · 3 · 7 기준).
 */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [];
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const r = raw / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  // 위아래 끝에 바짝 붙은 눈금은 빼요
  const edge = span * 0.04;
  const first = Math.ceil((lo + edge) / step);
  const out: number[] = [];
  for (let k = first; k * step <= hi - edge; k++) out.push(Number((k * step).toPrecision(12)));
  return out;
}
