import { exchangeDay, MAX_BARS, type ExchangeTz, type Interval } from '../lib/series';
import { marketOf, tzOf } from '../lib/format';
import { bundledUniverse, symbolIndex } from '../content';
import { lastRsi } from '../lib/indicators';
import { fearGreedLabel, fearGreedScore } from '../lib/market';
import type { BarsRow, MarketPayload, MarketRow, MarketSource, MarketState, QuoteRow } from './types';

/*
 * 개발용 예시 시세 — 실제 시세가 아니에요. 서버(8단계) 전 `npm run dev` 에서만 쓰고, 출시 번들에는 들어가지 않아요
 * (data/index.ts 가 import.meta.env.DEV 일 때만 불러와요). 종목·봉 단위마다 같은 값이 나오게 씨앗을 고정했어요.
 */

/** 끝 가격(예시) — 없으면 심볼에서 만든 값 */
const END_PRICE: Record<string, number> = {
  '005930.KS': 104500,
  '000660.KS': 512000,
  '035720.KS': 41250,
  '005380.KS': 268500,
  '247540.KQ': 132400,
  '^KS11': 2601.53,
  NVDA: 201.37,
  TSLA: 412.8,
  AAPL: 268.47,
  QQQ: 614.2,
  SPY: 682.4,
  'BTC-USD': 104820,
  'ETH-USD': 3521.4,
  'USDKRW=X': 1438.2,
  'JPYKRW=X': 9.45,
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}

const DAY = 86_400_000;
/** 봉 시작 시각(UTC 시) — 거래소 현지 날짜가 그 날이 되게 */
const OPEN_UTC_HOUR: Record<ExchangeTz, number> = { 'Asia/Seoul': 0, 'America/New_York': 14, UTC: 0 };

function isWeekend(day: string): boolean {
  const w = new Date(`${day}T00:00:00Z`).getUTCDay();
  return w === 0 || w === 6;
}

function prevDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY).toISOString().slice(0, 10);
}

/** 지금 기준 마지막 거래일(장이 아직 안 열렸으면 그 전 거래일) */
function lastSession(symbol: string, now: number): string {
  const market = marketOf(symbol, symbolIndex.get(symbol));
  const tz = tzOf(market);
  let day = exchangeDay(now, tz);
  if (market === 'CRYPTO') return day;
  const local = new Date(now + (tz === 'Asia/Seoul' ? 9 : -5) * 3_600_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const open = market === 'US' ? 9 * 60 + 30 : 9 * 60;
  if (market !== 'FX' && minutes < open) day = prevDay(day);
  while (isWeekend(day)) day = prevDay(day);
  return day;
}

function barDays(symbol: string, interval: Interval, count: number, now: number): string[] {
  const crypto = marketOf(symbol, symbolIndex.get(symbol)) === 'CRYPTO';
  let day = lastSession(symbol, now);
  const out: string[] = [];
  if (interval === '1d') {
    while (out.length < count) {
      if (crypto || !isWeekend(day)) out.push(day);
      day = prevDay(day);
    }
  } else if (interval === '1wk') {
    const d = new Date(`${day}T00:00:00Z`);
    let monday = d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY;
    while (out.length < count) {
      out.push(new Date(monday).toISOString().slice(0, 10));
      monday -= 7 * DAY;
    }
  } else {
    let [y, m] = day.split('-').map(Number);
    while (out.length < count) {
      out.push(`${y}-${String(m).padStart(2, '0')}-01`);
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
  }
  return out.reverse();
}

function makeBars(symbol: string, interval: Interval, now: number): BarsRow {
  const market = marketOf(symbol, symbolIndex.get(symbol));
  const tz = tzOf(market);
  const r = rng(hash(`${symbol}|${interval}`));
  const n = interval === '1mo' ? 240 : MAX_BARS;
  const days = barDays(symbol, interval, n, now);
  const baseVol = market === 'FX' ? 0.005 : market === 'CRYPTO' ? 0.03 : 0.019;
  const vol = baseVol * (interval === '1d' ? 1 : interval === '1wk' ? 2.2 : 4.5);
  const raw: number[] = [];
  const lowRaw: number[] = [];
  let p = 100;
  let left = 0;
  let drift = 0;
  for (let i = 0; i < n; i++) {
    if (left <= 0) {
      left = 25 + Math.floor(r() * 90);
      drift = (r() - 0.5) * vol * 0.9;
    }
    left -= 1;
    p *= 1 + drift + gauss(r) * vol;
    p = Math.max(p, 1);
    raw.push(p);
    lowRaw.push(p * (1 - Math.abs(gauss(r)) * vol * 0.55));
  }
  const span = { KR: [5000, 300000], US: [20, 600], CRYPTO: [0.5, 900], FX: [5, 2000] }[market];
  const end = END_PRICE[symbol] ?? Math.round(span[0] + ((hash(symbol) % 1000) / 1000) * (span[1] - span[0]));
  const k = end / raw[n - 1];
  const fix = (v: number) => Math.round(v * k * 100) / 100;
  const c = raw.map(fix);
  const l = lowRaw.map((v, i) => Math.min(fix(v), c[i]));
  const fiveYears = interval === '1d' ? 1250 : interval === '1wk' ? 260 : 60;
  return {
    key: `${symbol}|${interval}`,
    symbol,
    interval,
    currency: market === 'US' || market === 'CRYPTO' ? 'USD' : 'KRW',
    tz,
    source: market === 'CRYPTO' ? 'binance' : market === 'FX' ? 'frankfurter' : 'yahoo',
    t: days.map((d) => Date.parse(`${d}T00:00:00Z`) / 1000 + OPEN_UTC_HOUR[tz] * 3600),
    c,
    l,
    high5y: Math.max(...c.slice(-fiveYears)),
    updated_at: new Date(now).toISOString(),
  };
}

function stateOf(symbol: string, now: number): MarketState {
  const market = marketOf(symbol, symbolIndex.get(symbol));
  if (market === 'CRYPTO') return '24H';
  if (market === 'FX') return 'CLOSED';
  const tz = tzOf(market);
  if (isWeekend(exchangeDay(now, tz))) return 'CLOSED';
  const local = new Date(now + (tz === 'Asia/Seoul' ? 9 : -5) * 3_600_000);
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (market === 'KR') return m >= 540 && m < 930 ? 'REGULAR' : 'CLOSED';
  if (m >= 240 && m < 570) return 'PRE';
  if (m >= 570 && m < 960) return 'REGULAR';
  if (m >= 960 && m < 1200) return 'POST';
  return 'CLOSED';
}

function makeQuote(symbol: string, now: number): QuoteRow {
  const bars = makeBars(symbol, '1d', now);
  const n = bars.c.length;
  const price = bars.c[n - 1];
  const prev = bars.c[n - 2];
  const state = stateOf(symbol, now);
  const ext = state === 'PRE' || state === 'POST' ? (state === 'PRE' ? 'pre' : 'post') : null;
  const extPrice = ext ? Math.round(price * (1 + (rng(hash(symbol))() - 0.5) * 0.02) * 100) / 100 : null;
  return {
    symbol,
    price,
    prev_close: prev,
    change_pct: Math.round((price / prev - 1) * 10000) / 100,
    market_state: state,
    ext_session: ext,
    ext_price: extPrice,
    ext_change_pct: extPrice ? Math.round((extPrice / price - 1) * 10000) / 100 : null,
    source: bars.source,
    fetched_at: new Date(Math.floor(now / 300_000) * 300_000).toISOString(),
  };
}

/** 시장 탭 — 서버 market 작업처럼 시총 상위 목록의 일봉 RSI · 공포탐욕을 예시 봉으로 계산 */
function makeMarket(now: number): MarketPayload {
  const row = (symbol: string, i: number): MarketRow => {
    const rsi = lastRsi(makeBars(symbol, '1d', now).c);
    const q = makeQuote(symbol, now);
    return { symbol, rank: i + 1, rsi: rsi === null ? null : Math.round(rsi * 10) / 10, close: q.price, changePct: q.change_pct };
  };
  const kr = bundledUniverse.kr.map(row);
  const us = bundledUniverse.us.map(row);
  const low = [...kr, ...us]
    .filter((r) => r.rsi !== null && r.rsi <= 30)
    .sort((a, b) => a.rsi! - b.rsi!)
    .map((r) => r.symbol);
  const fg = (symbol: string, basis: string) => {
    const score = fearGreedScore(makeBars(symbol, '1d', now).c) ?? 50;
    return { score, label: fearGreedLabel(score), basis };
  };
  const day = new Date(now).toISOString().slice(0, 10);
  const crypto = 15 + (hash(day) % 70);
  return {
    schema: 1,
    asOf: new Date(Math.floor(now / 300_000) * 300_000).toISOString(),
    computedAt: new Date(Math.floor(now / 1_800_000) * 1_800_000).toISOString(),
    stale: false,
    universeVersion: bundledUniverse.contentVersion,
    fearGreed: {
      kr: fg('^KS11', '코스피 RSI와 120일선 위치'),
      us: fg('SPY', 'SPY RSI와 120일선 위치'),
      crypto: { score: crypto, label: fearGreedLabel(crypto), basis: 'alternative.me 코인 공포탐욕지수', attribution: '출처 alternative.me', sourceDate: day },
    },
    universe: { kr, us },
    low,
  };
}

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

export function fixtureSource(clock: () => number = Date.now, latencyMs = 450): MarketSource {
  return {
    async quotes(symbols) {
      await wait(latencyMs);
      return symbols.map((s) => makeQuote(s, clock()));
    },
    async bars(keys) {
      await wait(latencyMs);
      return keys.map((key) => {
        const [symbol, interval] = key.split('|') as [string, Interval];
        return makeBars(symbol, interval, clock());
      });
    },
    async track() {},
    async market() {
      await wait(latencyMs);
      return makeMarket(clock());
    },
  };
}
