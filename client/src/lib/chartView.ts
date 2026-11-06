import { exchangeDay, type ExchangeTz, type Interval } from './series';

/*
 * 차트 크게 보기 — 보이는 구간 계산(순수 함수). 봉 번호는 0(가장 오래된 봉) ~ n-1(최신).
 * end 는 오른쪽 끝 봉 번호(밀 때 소수도 돼요), count 는 그래프 너비에 들어가는 봉 수(벌리면 줄어요).
 * 봉 i 의 자리: (i - 시작) / (count - 1) — 0 이 그래프 왼쪽 끝, 1 이 오른쪽 끝.
 */

export interface ChartView {
  end: number;
  count: number;
}

/** 가장 크게 볼 때도 화면에 남기는 봉 수 */
export const MIN_VISIBLE = 20;

/** 크게 보기 그림의 왼쪽 여백(px) — 그림(ZoomChart)과 손짓(plot.left)이 같은 값을 써요 */
export const ZOOM_PL = 2;

/** 크게 보기 그림의 세로 배치(px): 가격 칸 · 날짜 줄(22) · 틈(12) · RSI 칸(높이의 27%, 최소 72) */
export function zoomLayout(height: number) {
  const rsiH = Math.max(72, Math.round(height * 0.27));
  const priceBottom = height - rsiH - 12 - 22;
  return { priceTop: 10, priceBottom, rsiTop: priceBottom + 22 + 12, rsiBottom: height - 4 };
}

const clampCount = (count: number, n: number) => Math.min(n, Math.max(Math.min(MIN_VISIBLE, n), count));

export function clampView(v: ChartView, n: number): ChartView {
  if (n < 2) return { end: Math.max(0, n - 1), count: Math.max(1, n) };
  const count = clampCount(v.count, n);
  const end = Math.min(n - 1, Math.max(count - 1, v.end));
  return { end, count };
}

/** 왼쪽 끝 봉 번호(소수) */
export function viewStart(v: ChartView): number {
  return v.end - (v.count - 1);
}

/** 처음 열 때: 자세히 화면과 같은 구간(최근 봉부터 shown 개) */
export function initialView(n: number, shown: number): ChartView {
  return clampView({ end: n - 1, count: shown }, n);
}

/** 최신 봉이 오른쪽 끝에 있는지 */
export function atLatest(v: ChartView, n: number): boolean {
  return v.end >= n - 1 - 0.01;
}

/** 손가락을 오른쪽으로 밀면(dx > 0) 지난 봉이 보여요 */
export function panView(v: ChartView, dxPx: number, plotWidth: number, n: number): ChartView {
  if (!(plotWidth > 0)) return v;
  return clampView({ end: v.end - (dxPx * (v.count - 1)) / plotWidth, count: v.count }, n);
}

/** factor > 1 이면 크게(봉 수가 줄어요). anchor(0~1) 자리의 봉은 그 자리에 남아요 */
export function zoomView(v: ChartView, factor: number, anchor: number, n: number): ChartView {
  const a = viewStart(v) + anchor * (v.count - 1);
  const count = clampCount(v.count / factor, n);
  const start = a - anchor * (count - 1);
  return clampView({ end: start + count - 1, count }, n);
}

/**
 * 두 손가락: 처음 두 손가락 가운데(from, 0~1)에 있던 봉이 지금 가운데(to)에 오게 하고,
 * 손가락 사이가 처음보다 ratio 배 벌어진 만큼 크게 봐요.
 */
export function pinchView(start: ChartView, from: number, to: number, ratio: number, n: number): ChartView {
  if (!(ratio > 0)) return start;
  const a = viewStart(start) + from * (start.count - 1);
  const count = clampCount(start.count / ratio, n);
  const s = a - to * (count - 1);
  return clampView({ end: s + count - 1, count }, n);
}

/** 그래프 위 자리(0~1)에 가장 가까운 봉 */
export function indexAt(v: ChartView, frac: number, n: number): number {
  const i = Math.round(viewStart(v) + Math.min(1, Math.max(0, frac)) * (v.count - 1));
  return Math.min(n - 1, Math.max(0, i));
}

/** 그릴 봉 범위(양 끝 한 봉씩 더 — 선이 그래프 가장자리까지 이어지게) */
export function drawRange(v: ChartView, n: number): [number, number] {
  return [Math.max(0, Math.floor(viewStart(v)) - 1), Math.min(n - 1, Math.ceil(v.end) + 1)];
}

/** 세로 범위를 잡을 봉(그래프 안에 다 들어온 봉) */
export function fitRange(v: ChartView, n: number): [number, number] {
  const a = Math.min(n - 1, Math.max(0, Math.ceil(viewStart(v) - 1e-6)));
  const b = Math.max(a, Math.min(n - 1, Math.floor(v.end + 1e-6)));
  return [a, b];
}

export interface TimeTick {
  index: number;
  text: string;
}

type Level = { unit: 'week' } | { unit: 'month' | 'year'; every: number };

const LEVELS: Level[] = [
  { unit: 'week' },
  { unit: 'month', every: 1 },
  { unit: 'month', every: 2 },
  { unit: 'month', every: 3 },
  { unit: 'month', every: 6 },
  { unit: 'year', every: 1 },
  { unit: 'year', every: 2 },
  { unit: 'year', every: 5 },
];

function mondayKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}

function isBoundary(level: Level, day: string, prev: string): boolean {
  if (level.unit === 'week') return mondayKey(day) !== mondayKey(prev);
  if (level.unit === 'month') {
    if (day.slice(0, 7) === prev.slice(0, 7)) return false;
    const m = Number(day.slice(5, 7));
    if (level.every === 1) return true;
    // 2달 간격은 자세히 차트와 같게 짝수 달 + 1월
    if (level.every === 2) return m === 1 || m % 2 === 0;
    return (m - 1) % level.every === 0;
  }
  if (day.slice(0, 4) === prev.slice(0, 4)) return false;
  return Number(day.slice(0, 4)) % level.every === 0;
}

function tickText(level: Level, day: string): string {
  const y = day.slice(0, 4);
  const m = Number(day.slice(5, 7));
  if (level.unit === 'week') return `${m}/${Number(day.slice(8, 10))}`;
  if (level.unit === 'month') return m === 1 ? `${y.slice(2)}년` : `${m}월`;
  return `${y}년`;
}

/**
 * 아래 날짜 눈금 — 주 · 달 · 2·3·6달 · 해 중에서 눈금 사이가 평균 gap(px) 이상인 가장 촘촘한 간격.
 * 글자: 주 '11/3' · 달 '3월'(1월은 '26년') · 해 '2025년'. 너무 붙은 눈금(minGap 미만)은 빼요.
 */
export function timeTicks(t: readonly number[], tz: ExchangeTz, interval: Interval, v: ChartView, plotWidth: number, gap = 50, minGap = 34): TimeTick[] {
  const n = t.length;
  if (n < 2 || !(plotWidth > 0) || v.count < 2) return [];
  const from = Math.max(1, Math.ceil(viewStart(v)));
  const to = Math.min(n - 1, Math.floor(v.end));
  if (to < from) return [];
  const list: { index: number; day: string; prev: string }[] = [];
  let prev = exchangeDay(t[from - 1] * 1000, tz);
  for (let i = from; i <= to; i++) {
    const day = exchangeDay(t[i] * 1000, tz);
    list.push({ index: i, day, prev });
    prev = day;
  }
  const pxPerBar = plotWidth / (v.count - 1);
  for (const level of LEVELS) {
    if (level.unit === 'week' && interval !== '1d') continue;
    const hits = list.filter((b) => isBoundary(level, b.day, b.prev));
    if (!hits.length) continue;
    const spacing = hits.length > 1 ? ((hits[hits.length - 1].index - hits[0].index) / (hits.length - 1)) * pxPerBar : Infinity;
    if (spacing < gap) continue;
    const out: TimeTick[] = [];
    for (const h of hits) {
      if (out.length && (h.index - out[out.length - 1].index) * pxPerBar < minGap) continue;
      out.push({ index: h.index, text: tickText(level, h.day) });
    }
    return out;
  }
  return [];
}
