import {
  ANALYSIS_BARS,
  divergence,
  displayLength,
  fromHigh,
  lastRsi,
  lowMarks,
  maCross,
  peakMarks,
  rsiLowSeries,
  rsiSeries,
  sma,
  zoneOf,
  type Divergence,
  type LowMark,
  type MaCross,
  type PeakMark,
  type Zone,
} from './indicators';

/*
 * 봉 + 현재가 → 카드·자세히 화면이 그릴 값.
 * 서버(palsal_bars)는 장 마감 뒤 하루 한 번 봉을 넣고, 현재가(palsal_quotes)는 장중 5분마다 바뀌어요.
 * 그래서 마지막 봉은 현재가로 고쳐 쓰거나(같은 날·같은 주·같은 달), 새 봉으로 붙여서(다음 거래일) RSI를 다시 계산해요.
 */

export type Interval = '1d' | '1wk' | '1mo';
export type ExchangeTz = 'Asia/Seoul' | 'America/New_York' | 'UTC';

/** 서버가 남기는 최대 봉 수(계약 bars.schema.json) — 180봉 화면에 50주선(코인 350일)을 끝까지 그릴 만큼 */
export const MAX_BARS = 530;

export interface Bars {
  interval: Interval;
  tz: ExchangeTz;
  /** 봉 시작 epoch 초 */
  t: number[];
  /** 종가 */
  c: number[];
  /** 저가 */
  l: number[];
  /** 이 봉 단위의 최근 5년 종가 최댓값 */
  high5y: number;
}

export interface QuoteLike {
  price: number;
  marketState: 'PRE' | 'REGULAR' | 'POST' | 'CLOSED' | '24H';
  /** epoch ms */
  fetchedAt: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** 거래소 현지 날짜 'YYYY-MM-DD' */
export function exchangeDay(epochMs: number, tz: ExchangeTz): string {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(tz, f);
  }
  return f.format(new Date(epochMs));
}

/** 그 날짜가 들어 있는 주의 월요일 'YYYY-MM-DD' */
function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

function samePeriod(a: string, b: string, interval: Interval): boolean {
  if (interval === '1d') return a === b;
  if (interval === '1wk') return mondayOf(a) === mondayOf(b);
  return a.slice(0, 7) === b.slice(0, 7);
}

/**
 * 현재가를 봉에 반영한 새 봉(원본은 그대로 둬요).
 * - 장 시작 전(PRE) 값은 마지막 거래일 값이라 붙이지 않고 마지막 봉만 고쳐요.
 * - 현재가가 마지막 봉보다 오래됐으면 무시해요.
 */
export function withQuote(bars: Bars, quote: QuoteLike | null): Bars {
  const n = bars.c.length;
  if (!quote || !(quote.price > 0) || n === 0) return bars;
  const lastDay = exchangeDay(bars.t[n - 1] * 1000, bars.tz);
  const quoteDay = exchangeDay(quote.fetchedAt, bars.tz);
  if (quoteDay < lastDay) return bars;
  const t = bars.t.slice();
  const c = bars.c.slice();
  const l = bars.l.slice();
  if (quote.price === c[n - 1]) return bars;
  if (quote.marketState === 'PRE' || samePeriod(quoteDay, lastDay, bars.interval)) {
    c[n - 1] = quote.price;
    l[n - 1] = Math.min(l[n - 1], quote.price);
  } else {
    t.push(Math.floor(Date.parse(`${quoteDay}T00:00:00Z`) / 1000));
    c.push(quote.price);
    l.push(quote.price);
    if (t.length > MAX_BARS) {
      t.shift();
      c.shift();
      l.shift();
    }
  }
  return { ...bars, t, c, l };
}

export interface ChartModel {
  /** 화면에 그리는 봉(오래된 것 → 최신) */
  t: number[];
  c: number[];
  /** 같은 칸의 이동평균. 계산할 수 없는 칸은 null */
  ma120: (number | null)[];
  /** 일봉만: 200일선 · 50주선(주식 250일 · 코인 350일) */
  ma200: (number | null)[] | null;
  ma50w: (number | null)[] | null;
  /** 같은 칸의 RSI(자세히 화면의 RSI 흐름) */
  rsi: (number | null)[];
  /** 아래 인덱스는 모두 화면 봉 기준 */
  lowMarks: LowMark[];
  peakMarks: PeakMark[];
  divergence: Divergence | null;
}

export interface Analysis {
  /** 머리의 RSI(14) — 소수 첫째 자리 */
  rsi: number | null;
  zone: Zone | null;
  /** 마지막 봉(현재가 반영) */
  price: number;
  /** 5년 최고가 대비 %(0 이상이면 새로 씀) */
  fromHigh: number;
  chart: ChartModel;
  /** 엇갈림(전체 봉 인덱스가 아니라 날짜로) */
  divergence: { type: Divergence['type']; fromT: number; toT: number; rsiFrom: number; rsiTo: number } | null;
  /** 최근 10봉 안의 60/120 교차 */
  cross: { type: MaCross['type']; t: number } | null;
}

function maWindow(values: (number | null)[], start: number): (number | null)[] {
  return values.slice(start);
}

/** 크게 보기 차트: 받은 봉 전부 + 자세히 화면이 보여 주는 첫 봉 */
export interface FullChartModel extends ChartModel {
  /** 자세히 화면 차트의 첫 봉 번호(처음 열면 이 구간을 보여 줘요) */
  detailStart: number;
}

/**
 * 크게 보기(밀고 벌리는 차트)용 — 받은 봉 전부. 이동평균·RSI 는 받은 봉 전부로 계산해요.
 * ▲△▼·엇갈림은 자세히 화면 구간 안이면 자세히와 같은 값(analyze 와 같은 최근 300봉 창),
 * 그보다 앞은 받은 봉 전부로 찾은 값이에요 — 지난 봉으로 밀어도 표시가 끊기지 않게.
 */
export function fullChart(bars: Bars, crypto: boolean): FullChartModel | null {
  const n = bars.c.length;
  if (n < 2) return null;
  const w0 = Math.max(0, n - ANALYSIS_BARS);
  const wc = bars.c.slice(w0);
  const wl = bars.l.slice(w0);
  const wr = rsiSeries(wc);
  const div = divergence(wc);
  const s0 = w0 + (wc.length - displayLength(wc.length, div));
  const fullRsi = rsiSeries(bars.c);
  const lift = <T extends { index: number }>(list: T[]) => list.map((m) => ({ ...m, index: m.index + w0 })).filter((m) => m.index >= s0);
  const before = <T extends { index: number }>(list: T[]) => list.filter((m) => m.index < s0);
  const long = bars.interval === '1d';

  return {
    t: bars.t,
    c: bars.c,
    ma120: sma(bars.c, 120),
    ma200: long ? sma(bars.c, 200) : null,
    ma50w: long ? sma(bars.c, crypto ? 350 : 250) : null,
    rsi: fullRsi,
    lowMarks: [...(s0 > 0 ? before(lowMarks(bars.l, fullRsi, rsiLowSeries(bars.c, bars.l))) : []), ...lift(lowMarks(wl, wr, rsiLowSeries(wc, wl)))],
    peakMarks: [...(s0 > 0 ? before(peakMarks(bars.c, fullRsi)) : []), ...lift(peakMarks(wc, wr))],
    divergence: div ? { ...div, from: div.from + w0, to: div.to + w0 } : null,
    detailStart: s0,
  };
}

/**
 * 카드·자세히 화면이 쓰는 값 전부. crypto 면 50주선을 350일로(코인은 주 7일).
 * ▲△▼·엇갈림·교차는 원본처럼 최근 300봉 안에서 찾고, 머리의 RSI는 받은 봉 전부로 계산해요.
 */
export function analyze(bars: Bars, crypto: boolean): Analysis | null {
  const n = bars.c.length;
  if (n < 2) return null;
  // 화면엔 소수 첫째 자리로 보여 주니, 구간·걸러 보기·변화 감지도 같은 값으로(30.04 가 '30.0 보통'으로 보이지 않게)
  const raw = lastRsi(bars.c);
  const rsi = raw === null ? null : Math.round(raw * 10) / 10;
  const price = bars.c[n - 1];

  const w0 = Math.max(0, n - ANALYSIS_BARS);
  const wc = bars.c.slice(w0);
  const wl = bars.l.slice(w0);
  const wr = rsiSeries(wc);
  const wrl = rsiLowSeries(wc, wl);
  const div = divergence(wc);
  const len = displayLength(wc.length, div);
  const d0 = wc.length - len;
  const s0 = w0 + d0;

  const shift = <T extends { index: number }>(list: T[]) => list.filter((m) => m.index >= d0).map((m) => ({ ...m, index: m.index - d0 }));
  const cross = maCross(wc);
  const long = bars.interval === '1d';
  const fullRsi = rsiSeries(bars.c);

  return {
    rsi,
    zone: rsi === null ? null : zoneOf(rsi),
    price,
    fromHigh: fromHigh(price, Math.max(bars.high5y, price)),
    chart: {
      t: bars.t.slice(s0),
      c: bars.c.slice(s0),
      ma120: maWindow(sma(bars.c, 120), s0),
      ma200: long ? maWindow(sma(bars.c, 200), s0) : null,
      ma50w: long ? maWindow(sma(bars.c, crypto ? 350 : 250), s0) : null,
      rsi: fullRsi.slice(s0),
      lowMarks: shift(lowMarks(wl, wr, wrl)),
      peakMarks: shift(peakMarks(wc, wr)),
      divergence: div && div.from >= d0 ? { ...div, from: div.from - d0, to: div.to - d0 } : null,
    },
    divergence: div ? { type: div.type, fromT: bars.t[w0 + div.from], toT: bars.t[w0 + div.to], rsiFrom: div.rsiFrom, rsiTo: div.rsiTo } : null,
    cross: cross ? { type: cross.type, t: bars.t[w0 + cross.index] } : null,
  };
}
