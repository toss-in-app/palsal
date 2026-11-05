/**
 * palsal 서버 계산 — 클라이언트(client/src/lib/indicators.ts · series.ts · market.ts)와 **같은 규칙**을 옮긴 순수 함수.
 * Deno 는 확장자 없는 import 를 못 읽어서 클라 파일을 바로 쓰지 않고 여기 옮겨 둬요.
 * 두 쪽이 달라지면 client/src/lib/serverCalc.test.ts 가 실패해요 — 한쪽을 고치면 다른 쪽도 같이.
 */

export const RSI_PERIOD = 14;
export const MAX_BARS = 530;

export type Interval = '1d' | '1wk' | '1mo';
export type ExchangeTz = 'Asia/Seoul' | 'America/New_York' | 'UTC';
export type Market = 'KR' | 'US' | 'CRYPTO' | 'FX';
export type MarketState = 'PRE' | 'REGULAR' | 'POST' | 'CLOSED' | '24H';

const round2 = (v: number) => Math.round(v * 100) / 100;

function rsiValue(avgGain: number, avgLoss: number): number {
  return avgLoss === 0 ? 100 : round2(100 - 100 / (1 + avgGain / avgLoss));
}

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

/** 종가 RSI(14), Wilder. 인덱스 14부터 값 */
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

export function lastRsi(closes: readonly number[]): number | null {
  const s = rsiSeries(closes);
  return s.length ? s[s.length - 1] : null;
}

/** 화면 머리 RSI 와 같게 소수 첫째 자리 */
export const headlineRsi = (rsi: number | null): number | null => (rsi === null ? null : Math.round(rsi * 10) / 10);

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

export interface Bars {
  interval: Interval;
  tz: ExchangeTz;
  t: number[];
  c: number[];
  l: number[];
}

export interface QuoteLike {
  price: number;
  marketState: MarketState;
  /** epoch ms */
  fetchedAt: number;
}

/** 현재가를 봉에 반영(클라 withQuote 와 같음): PRE·같은 기간이면 마지막 봉을 고치고, 아니면 새 봉을 붙여요 */
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

/** 공포탐욕(한국·미국) — 클라 lib/market.ts 와 같은 공식 */
export function fearGreedScore(closes: readonly number[]): number | null {
  if (closes.length < 20) return null;
  const price = closes[closes.length - 1];
  let position = 50;
  if (closes.length >= 120) {
    let sum = 0;
    for (let i = closes.length - 120; i < closes.length; i++) sum += closes[i];
    const ma = sum / 120;
    position = 50 + ((price - ma) / ma) * 100 * 2.5;
  }
  position = Math.max(0, Math.min(100, position));
  const rsi = lastRsi(closes);
  const score = rsi === null ? position : rsi * 0.6 + position * 0.4;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export type FearGreedLabel = '극단적 공포' | '공포' | '중립' | '탐욕' | '극단적 탐욕';

export function fearGreedLabel(score: number): FearGreedLabel {
  if (score <= 24) return '극단적 공포';
  if (score <= 44) return '공포';
  if (score <= 55) return '중립';
  if (score <= 75) return '탐욕';
  return '극단적 탐욕';
}

/** 심볼 꼴로 시장(클라 marketOf 의 심볼 규칙과 같음) */
export function marketOfSymbol(symbol: string): Market {
  if (/\.(KS|KQ)$/.test(symbol) || /^\^(KS|KQ)/.test(symbol)) return 'KR';
  if (symbol.endsWith('-USD')) return 'CRYPTO';
  if (symbol.endsWith('=X')) return 'FX';
  return 'US';
}

export function tzOfMarket(market: Market): ExchangeTz {
  return market === 'KR' ? 'Asia/Seoul' : market === 'US' ? 'America/New_York' : 'UTC';
}

/**
 * 값 반올림(계약 v1.9 server.md): 한국 원은 정수, 미국 달러·지수·환율은 소수 4자리, 코인은 유효숫자 8자리.
 * 지수(^…)는 원화 지수라도 소수가 있어 4자리로 둬요.
 */
export function roundPrice(symbol: string, v: number): number {
  const market = marketOfSymbol(symbol);
  if (market === 'CRYPTO') return Number(v.toPrecision(8));
  if (market === 'KR' && !symbol.startsWith('^')) return Math.round(v);
  return Math.round(v * 1e4) / 1e4;
}

export const roundPct = (v: number): number => Math.round(v * 100) / 100;
