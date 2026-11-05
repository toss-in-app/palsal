import { HIGH_LINE, LOW_LINE, sma } from './indicators';
import type { Analysis, Bars, Interval } from './series';

/*
 * '이 종목 소식' — 화면에 그린 기간 안에서 있었던 일을 봉에서 다시 찾아요(저장한 기록이 아니라 계산).
 * 종류는 변화 배너(기능 ④)와 같아요: RSI 30 아래 진입 · 70 위 진입 · 60/120 교차 · 5년 최고가, 그리고 엇갈림.
 * RSI 는 화면처럼 소수 첫째 자리로 비교해요.
 */

export type StockEventKind = 'rsi_low_enter' | 'rsi_high_enter' | 'ma_cross_up' | 'ma_cross_down' | 'div_bull' | 'div_bear' | 'high5y';

export interface StockEvent {
  kind: StockEventKind;
  /** 그 일이 일어난 봉(엇갈림은 뒤 지점) epoch 초 */
  t: number;
  /** 엇갈림 앞 지점 epoch 초 */
  fromT?: number;
  /** RSI 진입·엇갈림이면 전후 RSI */
  from?: number;
  to?: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export const EVENTS_MAX = 8;

/** 새 것부터, 최대 8개. bars 는 현재가를 반영한 봉, analysis 는 그 봉으로 계산한 값 */
export function stockEvents(bars: Bars, analysis: Analysis): StockEvent[] {
  const out: StockEvent[] = [];
  const { chart } = analysis;
  const n = bars.c.length;
  const start = n - chart.c.length;

  for (let k = 1; k < chart.rsi.length; k++) {
    const a = chart.rsi[k - 1];
    const b = chart.rsi[k];
    if (a === null || b === null) continue;
    const pa = round1(a);
    const pb = round1(b);
    if (pa > LOW_LINE && pb <= LOW_LINE) out.push({ kind: 'rsi_low_enter', t: chart.t[k], from: pa, to: pb });
    if (pa < HIGH_LINE && pb >= HIGH_LINE) out.push({ kind: 'rsi_high_enter', t: chart.t[k], from: pa, to: pb });
  }

  const m60 = sma(bars.c, 60);
  const m120 = sma(bars.c, 120);
  for (let i = Math.max(start, 1); i < n; i++) {
    const a0 = m60[i - 1];
    const b0 = m120[i - 1];
    const a1 = m60[i];
    const b1 = m120[i];
    if (a0 === null || b0 === null || a1 === null || b1 === null) continue;
    if (a0 - b0 <= 0 && a1 - b1 > 0) out.push({ kind: 'ma_cross_up', t: bars.t[i] });
    if (a0 - b0 >= 0 && a1 - b1 < 0) out.push({ kind: 'ma_cross_down', t: bars.t[i] });
  }

  const d = analysis.divergence;
  if (d) out.push({ kind: d.type === 'bull' ? 'div_bull' : 'div_bear', t: d.toT, fromT: d.fromT, from: d.rsiFrom, to: d.rsiTo });
  const high = lastNewHigh(bars, start);
  if (high) out.push(high);

  return out.sort((x, y) => y.t - x.t).slice(0, EVENTS_MAX);
}

/**
 * 5년 최고가를 새로 쓴 가장 최근 봉. 서버의 high5y 는 마지막 갱신 때까지의 5년 종가 최댓값이라,
 * 그 값과 같거나 넘는 봉(현재가를 반영한 마지막 봉 포함)이 곧 '새로 쓴 날'이에요. 그보다 앞선 날은 알 수 없어서 하나만.
 */
function lastNewHigh(bars: Bars, from: number): StockEvent | null {
  for (let i = bars.c.length - 1; i >= Math.max(from, 0); i--) {
    if (bars.c[i] >= bars.high5y) return { kind: 'high5y', t: bars.t[i], from: bars.c[i] > bars.high5y ? bars.high5y : undefined, to: bars.c[i] };
  }
  return null;
}

/** 변화 배너·최근 바뀐 것에 쓰는 종류(엇갈림은 빼요) */
export type ChangeKind = 'rsi_low_enter' | 'rsi_high_enter' | 'ma_cross_up' | 'ma_cross_down' | 'high5y';

/** sinceSec(epoch 초) 이후 봉에서 있었던 변화 — 기기 기록(palsal.changes.v1)에 합쳐요 */
export function recentChanges(bars: Bars, analysis: Analysis, sinceSec: number): (StockEvent & { kind: ChangeKind })[] {
  return stockEvents(bars, analysis).filter((e): e is StockEvent & { kind: ChangeKind } => e.kind !== 'div_bull' && e.kind !== 'div_bear' && e.t >= sinceSec);
}

const UNIT: Record<Interval, string> = { '1d': '일', '1wk': '주', '1mo': '개월' };

/** 소식 제목(사실 문장만) */
export function eventTitle(e: StockEvent, interval: Interval): string {
  const u = UNIT[interval];
  switch (e.kind) {
    case 'rsi_low_enter':
      return 'RSI가 30 아래로 내려왔어요';
    case 'rsi_high_enter':
      return 'RSI가 70을 넘었어요';
    case 'ma_cross_up':
      return `60${u}선이 120${u}선을 위로 넘었어요`;
    case 'ma_cross_down':
      return `60${u}선이 120${u}선 아래로 내려갔어요`;
    case 'div_bull':
      return '가격은 내리고 RSI는 올랐어요';
    case 'div_bear':
      return '가격은 오르고 RSI는 내렸어요';
    case 'high5y':
      return '5년 최고가를 새로 썼어요';
  }
}

/** 소식을 누르면 여는 용어(content.json glossary 키) */
export function eventTerm(kind: StockEventKind): string {
  if (kind === 'rsi_low_enter') return 'zone-low';
  if (kind === 'rsi_high_enter') return 'zone-high';
  if (kind === 'ma_cross_up' || kind === 'ma_cross_down') return 'ma-cross';
  if (kind === 'high5y') return 'high5y';
  return 'divergence';
}
