/**
 * 지표 계산 — 원본(RSIngTime)과 같은 규칙을 새로 짠 순수 함수들(코드는 가져오지 않았어요).
 * 배열은 모두 봉 순서(오래된 것 → 최신), 결과도 같은 인덱스에 맞춰 돌려줘요(계산할 수 없는 앞부분은 null).
 *
 * - RSI(14): Wilder 방식. 첫 14칸 평균 → (이전 × 13 + 이번) / 14. 값은 소수 둘째 자리까지 반올림.
 * - 장중 RSI: 그 봉만 종가 대신 저가(종가보다 높으면 종가)로 계산한 RSI — △(장중에만 30 아래)에 써요.
 * - 표시 계산(▲△▼ · 엇갈림 · 교차)은 최근 300봉(`ANALYSIS_BARS`)으로, 화면은 기본 최근 180봉.
 */

export const RSI_PERIOD = 14;
export const LOW_LINE = 30;
export const HIGH_LINE = 70;
/** ▲△▼ · 엇갈림 · 60/120 교차를 찾는 범위(원본과 같은 300봉) */
export const ANALYSIS_BARS = 300;
/** 차트 기본 표시 봉 수 */
export const DISPLAY_BARS = 180;

export type Zone = 'vlow' | 'low' | 'mid' | 'high';

/** 구간: 아주 낮음 <20 · 낮음 ≤30 · 보통 · 높음 ≥70 */
export function zoneOf(rsi: number): Zone {
  if (rsi < 20) return 'vlow';
  if (rsi <= LOW_LINE) return 'low';
  if (rsi < HIGH_LINE) return 'mid';
  return 'high';
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function rsiValue(avgGain: number, avgLoss: number): number {
  return avgLoss === 0 ? 100 : round2(100 - 100 / (1 + avgGain / avgLoss));
}

/** 첫 14칸 평균. 봉이 15개보다 적으면 null */
function seed(closes: readonly number[]): { gain: number; loss: number } | null {
  if (closes.length < RSI_PERIOD + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= RSI_PERIOD; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  return { gain: gain / RSI_PERIOD, loss: loss / RSI_PERIOD };
}

/** 종가 RSI(14). 인덱스 14부터 값이 있어요 */
export function rsiSeries(closes: readonly number[]): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  const s = seed(closes);
  if (!s) return out;
  let { gain, loss } = s;
  out[RSI_PERIOD] = rsiValue(gain, loss);
  for (let i = RSI_PERIOD + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (RSI_PERIOD - 1) + (d > 0 ? d : 0)) / RSI_PERIOD;
    loss = (loss * (RSI_PERIOD - 1) + (d < 0 ? -d : 0)) / RSI_PERIOD;
    out[i] = rsiValue(gain, loss);
  }
  return out;
}

/** 장중 RSI — 그 봉만 저가로 마감했다고 치고 계산한 RSI. 인덱스 15부터 */
export function rsiLowSeries(closes: readonly number[], lows: readonly number[]): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  const s = seed(closes);
  if (!s || lows.length !== closes.length) return out;
  let { gain, loss } = s;
  for (let i = RSI_PERIOD + 1; i < closes.length; i++) {
    const low = lows[i] > 0 ? Math.min(lows[i], closes[i]) : closes[i];
    const dl = low - closes[i - 1];
    out[i] = rsiValue((gain * (RSI_PERIOD - 1) + (dl > 0 ? dl : 0)) / RSI_PERIOD, (loss * (RSI_PERIOD - 1) + (dl < 0 ? -dl : 0)) / RSI_PERIOD);
    const d = closes[i] - closes[i - 1];
    gain = (gain * (RSI_PERIOD - 1) + (d > 0 ? d : 0)) / RSI_PERIOD;
    loss = (loss * (RSI_PERIOD - 1) + (d < 0 ? -d : 0)) / RSI_PERIOD;
  }
  return out;
}

/** 마지막 봉의 RSI(14). 봉이 모자라면 null */
export function lastRsi(closes: readonly number[]): number | null {
  const s = rsiSeries(closes);
  return s.length ? s[s.length - 1] : null;
}

/** 단순 이동평균 */
export function sma(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export interface MaCross {
  /** up = 60선이 120선을 위로 넘음, down = 아래로 내려감 */
  type: 'up' | 'down';
  index: number;
}

/** 최근 10봉 안의 60/120 교차(가장 최근 것 하나). 봉이 121개보다 적으면 null */
export function maCross(closes: readonly number[]): MaCross | null {
  if (closes.length < 121) return null;
  const m60 = sma(closes, 60);
  const m120 = sma(closes, 120);
  const lookback = Math.min(10, closes.length - 120);
  for (let i = closes.length - 1; i >= closes.length - lookback; i--) {
    const a0 = m60[i - 1];
    const b0 = m120[i - 1];
    const a1 = m60[i];
    const b1 = m120[i];
    if (a0 === null || b0 === null || a1 === null || b1 === null) continue;
    if (a0 - b0 <= 0 && a1 - b1 > 0) return { type: 'up', index: i };
    if (a0 - b0 >= 0 && a1 - b1 < 0) return { type: 'down', index: i };
  }
  return null;
}

interface Pivot {
  index: number;
  value: number;
}

/** 앞뒤 win 칸보다 엄격히 낮은(높은) 지점 */
function pivots(values: readonly number[], win: number, kind: 'low' | 'high'): Pivot[] {
  const out: Pivot[] = [];
  for (let i = win; i < values.length - win; i++) {
    let ok = true;
    for (let j = i - win; j <= i + win && ok; j++) {
      if (j === i) continue;
      if (kind === 'low' ? values[j] <= values[i] : values[j] >= values[i]) ok = false;
    }
    if (ok) out.push({ index: i, value: values[i] });
  }
  return out;
}

export interface Divergence {
  /** bull = 가격은 내리고 RSI는 오름, bear = 가격은 오르고 RSI는 내림 */
  type: 'bull' | 'bear';
  /** closes 기준 인덱스(앞 지점 → 뒤 지점) */
  from: number;
  to: number;
  rsiFrom: number;
  rsiTo: number;
}

/**
 * 가격·RSI 엇갈림 — 최근 90봉만 떼어 RSI를 새로 계산하고, 마지막 두 저점(고점)을 비교해요.
 * 뒤 지점은 최근 20봉 안이어야 하고, 같은 자리(±6봉)의 RSI 저점(고점)이 반대로 움직였을 때만.
 */
export function divergence(closes: readonly number[]): Divergence | null {
  const recent = closes.slice(-90);
  if (recent.length < 30) return null;
  const base = closes.length - recent.length;
  const rsiAll = rsiSeries(recent);
  const start = RSI_PERIOD + 1;
  if (recent.length - start < 20) return null;
  const rsi = rsiAll.slice(start) as number[];
  const price = recent.slice(start);
  const offset = base + start;
  const win = 3;
  const near = (list: Pivot[], at: number) => {
    let hit: Pivot | null = null;
    for (const p of list) if (Math.abs(p.index - at) <= win * 2) hit = p;
    return hit;
  };
  const round1 = (v: number) => Math.round(v * 10) / 10;

  const pl = pivots(price, win, 'low');
  const rl = pivots(rsi, win, 'low');
  if (pl.length >= 2 && rl.length >= 2) {
    const [a, b] = pl.slice(-2);
    if (b.value < a.value * 0.998 && b.index >= price.length - 20) {
      const ra = near(rl, a.index);
      const rb = near(rl, b.index);
      if (ra && rb && rb.value > ra.value * 1.002) {
        return { type: 'bull', from: a.index + offset, to: b.index + offset, rsiFrom: round1(ra.value), rsiTo: round1(rb.value) };
      }
    }
  }
  const ph = pivots(price, win, 'high');
  const rh = pivots(rsi, win, 'high');
  if (ph.length >= 2 && rh.length >= 2) {
    const [a, b] = ph.slice(-2);
    if (b.value > a.value * 1.002 && b.index >= price.length - 20) {
      const ra = near(rh, a.index);
      const rb = near(rh, b.index);
      if (ra && rb && rb.value < ra.value * 0.998) {
        return { type: 'bear', from: a.index + offset, to: b.index + offset, rsiFrom: round1(ra.value), rsiTo: round1(rb.value) };
      }
    }
  }
  return null;
}

/** ▼ 판정 설정 — 원본 기본값 그대로(원본의 '기준 찾기' 백테스트는 넣지 않았어요) */
const PEAK = {
  pivotWin: 4,
  minGap: 10,
  rsiDrop: 8,
  peakRsiMin: 60,
  rallyMin: 0.12,
  rallyLookback: 60,
  cooldown: 40,
  maLen: 60,
  extremePctile: 10,
  extremeFloor: 0.04,
  extremeRsi: 70,
  newHighOverride: 0.02,
} as const;

export interface PeakMark {
  index: number;
  /** div = 앞 고점보다 가격은 높은데 RSI는 낮아진 고점, gap = 60일선에서 평소보다 훨씬 멀어진 고점 */
  kind: 'div' | 'gap';
}

/**
 * ▼ 엇갈린 고점. 충분히 오른(60봉 안 저점보다 12% 이상) 국지 고점 중
 * (가) 앞 고점보다 가격은 0.2% 넘게 높은데 RSI는 8 이상 낮고 60 이상인 곳, 또는
 * (나) 60일선과 거리가 4% 이상이면서 그 종목의 최근 250봉 거리 중 상위 10%이고 RSI 70 이상인 곳.
 * 한 번 찍으면 40봉 동안은 더 높은 고점(2% 넘게)만 다시 찍어요.
 */
export function peakMarks(closes: readonly number[], rsi: readonly (number | null)[]): PeakMark[] {
  const out: PeakMark[] = [];
  const n = closes.length;
  if (n < 40) return out;
  const W = PEAK.pivotWin;
  const highs: number[] = [];
  for (let i = W; i < n - W; i++) {
    let top = true;
    for (let j = i - W; j <= i + W && top; j++) if (j !== i && closes[j] > closes[i]) top = false;
    if (top) highs.push(i);
  }
  const ma = sma(closes, PEAK.maLen);
  const gapAt = (i: number) => {
    const m = ma[i];
    return m !== null && m > 0 ? closes[i] / m - 1 : null;
  };
  const gapThreshold = (i: number) => {
    const hist: number[] = [];
    for (let j = Math.max(0, i - 250); j <= i; j++) {
      const g = gapAt(j);
      if (g !== null) hist.push(g);
    }
    if (hist.length < 40) return null;
    hist.sort((a, b) => a - b);
    const pos = Math.min(hist.length - 1, Math.max(0, Math.floor(hist.length * (1 - PEAK.extremePctile / 100))));
    return hist[pos];
  };
  const rallied = (i: number) => {
    let low = Infinity;
    for (let j = Math.max(0, i - PEAK.rallyLookback); j <= i; j++) low = Math.min(low, closes[j]);
    return Number.isFinite(low) && low > 0 && closes[i] / low - 1 >= PEAK.rallyMin;
  };

  let lastIndex = -Infinity;
  let lastPrice = -Infinity;
  for (let k = 0; k < highs.length; k++) {
    const i2 = highs[k];
    const p2 = closes[i2];
    const r2 = rsi[i2];
    if (r2 === null || r2 === undefined) continue;
    if (i2 - lastIndex < PEAK.cooldown && !(p2 > lastPrice * (1 + PEAK.newHighOverride))) continue;
    if (!rallied(i2)) continue;
    let kind: PeakMark['kind'] | null = null;
    if (k >= 1) {
      const i1 = highs[k - 1];
      const r1 = rsi[i1];
      if (r1 !== null && r1 !== undefined && i2 - i1 >= PEAK.minGap && p2 > closes[i1] * 1.002 && r2 <= r1 - PEAK.rsiDrop && r2 >= PEAK.peakRsiMin) kind = 'div';
    }
    if (!kind) {
      const g = gapAt(i2);
      if (g !== null && g >= PEAK.extremeFloor && r2 >= PEAK.extremeRsi) {
        const thr = gapThreshold(i2);
        if (thr !== null && g >= thr) kind = 'gap';
      }
    }
    if (!kind) continue;
    out.push({ index: i2, kind });
    lastIndex = i2;
    lastPrice = p2;
  }
  return out;
}

export interface LowMark {
  index: number;
  /** true = ▲ 종가로 30 아래 마감한 구간, false = △ 장중에만 30 아래 */
  closed: boolean;
}

/**
 * ▲△ — 종가 RSI 또는 장중 RSI가 30 이하인 봉이 이어진 구간마다, 저가가 가장 낮은 봉 하나.
 * 구간 안에 종가 RSI 30 이하가 한 번이라도 있으면 ▲, 없으면 △.
 */
export function lowMarks(lows: readonly number[], rsi: readonly (number | null)[], rsiLow: readonly (number | null)[]): LowMark[] {
  const out: LowMark[] = [];
  let zone: { start: number; end: number; closed: boolean } | null = null;
  const flush = () => {
    if (!zone) return;
    let idx = zone.start;
    for (let i = zone.start; i <= zone.end; i++) if (lows[i] < lows[idx]) idx = i;
    out.push({ index: idx, closed: zone.closed });
    zone = null;
  };
  for (let i = RSI_PERIOD + 1; i < rsi.length; i++) {
    const r = rsi[i];
    const rl = rsiLow[i];
    const closed = r !== null && r <= LOW_LINE;
    const touched = closed || (rl !== null && rl <= LOW_LINE);
    if (touched) {
      if (!zone) zone = { start: i, end: i, closed };
      else {
        zone.end = i;
        if (closed) zone.closed = true;
      }
    } else flush();
  }
  flush();
  return out;
}

/** 엇갈림 두 지점이 보이도록 넓힌 표시 봉 수(기본 180, 최대 n) */
export function displayLength(n: number, div: Divergence | null): number {
  if (!div) return Math.min(DISPLAY_BARS, n);
  const need = n - Math.min(div.from, div.to) + 4;
  return Math.min(n, Math.max(DISPLAY_BARS, need));
}

/** 5년 최고가 대비(%) — 0 이상이면 새로 쓴 것 */
export function fromHigh(price: number, high: number): number {
  return round2(((price - high) / high) * 100);
}
