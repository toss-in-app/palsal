/**
 * 출처 어댑터 — 야후(비공식) · 바이낸스 · Frankfurter · alternative.me (계약 contract/server.md '출처 바꾸기').
 * 정직한 User-Agent 만 써요. 브라우저 흉내·쿠키 재사용·IP 돌리기 같은 차단 우회는 하지 않아요.
 * 모든 가격은 넣기 전에 반올림(계약 v1.9). 봉은 일·주·월 모두 5년(원본 RSIngTime 과 같은 범위, high5y = 그 종가 최댓값).
 */
import { MAX_BARS, marketOfSymbol, roundPct, roundPrice, tzOfMarket, type Interval, type MarketState } from '../_shared/calc.ts';

const UA = Deno.env.get('USER_AGENT') ?? 'palsal/1.0';
const FIVE_YEARS_MS = 5 * 365.25 * 86_400_000;

export type Source = 'yahoo' | 'binance' | 'frankfurter' | 'alternative';

export class SourceError extends Error {
  constructor(
    readonly source: Source,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface QuoteRow {
  symbol: string;
  price: number;
  prev_close: number;
  change_pct: number;
  market_state: MarketState;
  ext_session: 'pre' | 'post' | null;
  ext_price: number | null;
  ext_change_pct: number | null;
  source: 'yahoo' | 'binance' | 'frankfurter';
  fetched_at: string;
}

export interface BarsRow {
  key: string;
  symbol: string;
  interval: Interval;
  currency: 'KRW' | 'USD' | 'JPY';
  tz: 'Asia/Seoul' | 'America/New_York' | 'UTC';
  source: 'yahoo' | 'binance' | 'frankfurter';
  t: number[];
  c: number[];
  l: number[];
  high5y: number;
  updated_at: string;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, source: Source, timeoutMs = 15_000): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new SourceError(source, 0, `${source} 연결 실패: ${(e as Error).message}`);
  }
  if (res.status === 404) {
    await res.body?.cancel();
    return null;
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new SourceError(source, res.status, `${source} ${res.status}`);
  }
  return res.json();
}

const iso = (ms: number) => new Date(ms).toISOString();
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function quoteFrom(symbol: string, price: number, prev: number, state: MarketState, source: QuoteRow['source'], now: number, ext?: { session: 'pre' | 'post'; price: number }): QuoteRow {
  const p = roundPrice(symbol, price);
  const pc = roundPrice(symbol, prev);
  const e = ext ? roundPrice(symbol, ext.price) : null;
  return {
    symbol,
    price: p,
    prev_close: pc,
    change_pct: roundPct((p / pc - 1) * 100),
    market_state: state,
    ext_session: ext && e ? ext.session : null,
    ext_price: ext && e ? e : null,
    ext_change_pct: ext && e ? roundPct((e / p - 1) * 100) : null,
    source,
    fetched_at: iso(now),
  };
}

/** 봉 꼴 정리: 종가 없는 칸 빼고 · 시각 오름차순 · 반올림 · 최근 530 · high5y 는 5년 안 종가 최댓값 */
function shapeBars(symbol: string, interval: Interval, source: BarsRow['source'], currency: string | undefined, raw: { t: number; c: number; l: number | null }[], now: number): BarsRow | null {
  const since = (now - FIVE_YEARS_MS) / 1000;
  const byT = new Map<number, { c: number; l: number }>();
  for (const b of raw) {
    if (!isNum(b.c) || !Number.isFinite(b.t) || b.t < since) continue;
    const c = roundPrice(symbol, b.c);
    const l = isNum(b.l) ? Math.min(roundPrice(symbol, b.l), c) : c;
    byT.set(Math.floor(b.t), { c, l });
  }
  const ts = [...byT.keys()].sort((a, b) => a - b);
  if (!ts.length) return null;
  const high5y = Math.max(...ts.map((t) => byT.get(t)!.c));
  const keep = ts.slice(-MAX_BARS);
  const market = marketOfSymbol(symbol);
  const cur = currency === 'KRW' || currency === 'USD' || currency === 'JPY' ? currency : market === 'KR' || market === 'FX' ? 'KRW' : 'USD';
  return {
    key: `${symbol}|${interval}`,
    symbol,
    interval,
    currency: cur,
    tz: tzOfMarket(market),
    source,
    t: keep,
    c: keep.map((t) => byT.get(t)!.c),
    l: keep.map((t) => byT.get(t)!.l),
    high5y,
    updated_at: iso(now),
  };
}

// ---------------------------------------------------------------- 야후

interface Period {
  start: number;
  end: number;
}
interface SparkMeta {
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketTime?: number;
  currentTradingPeriod?: { pre?: Period; regular?: Period; post?: Period };
}

/** 장 상태: 정규장 시간인데 오늘 체결이 없으면(휴장일) CLOSED. 한국은 시간외를 따로 보이지 않아 정규장 밖은 PRE(장 전)·CLOSED */
function stateOf(meta: SparkMeta, nowS: number, us: boolean): MarketState {
  const p = meta.currentTradingPeriod;
  const inside = (x?: Period) => !!x && x.start <= nowS && nowS < x.end;
  if (inside(p?.regular)) return (meta.regularMarketTime ?? 0) >= p!.regular!.start ? 'REGULAR' : 'CLOSED';
  if (inside(p?.pre)) return 'PRE';
  if (us && inside(p?.post)) return 'POST';
  return 'CLOSED';
}

/** 현재가 묶음(spark, 한 요청 최대 batch 종목). 응답이 없는 심볼은 missing */
export async function yahooQuotes(symbols: string[], now: number): Promise<{ rows: QuoteRow[]; missing: string[] }> {
  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.map(encodeURIComponent).join(',')}&range=1d&interval=5m&includePrePost=true`;
  const json = (await getJson(url, 'yahoo')) as { spark?: { result?: { symbol: string; response?: { meta?: SparkMeta; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] }[] } } | null;
  const rows: QuoteRow[] = [];
  const seen = new Set<string>();
  const nowS = now / 1000;
  for (const r of json?.spark?.result ?? []) {
    const resp = r.response?.[0];
    const meta = resp?.meta;
    const price = meta?.regularMarketPrice;
    const prev = meta?.previousClose ?? meta?.chartPreviousClose;
    if (!meta || !isNum(price) || !isNum(prev)) continue;
    const us = marketOfSymbol(r.symbol) === 'US';
    const state = stateOf(meta, nowS, us);
    let ext: { session: 'pre' | 'post'; price: number } | undefined;
    if (us && !r.symbol.startsWith('^')) {
      const ts = resp?.timestamp ?? [];
      const closes = resp?.indicators?.quote?.[0]?.close ?? [];
      let i = ts.length - 1;
      while (i >= 0 && !isNum(closes[i])) i--;
      const period = meta.currentTradingPeriod;
      if (i >= 0 && period) {
        const t = ts[i];
        const last = closes[i] as number;
        if (state === 'PRE' && period.pre && t >= period.pre.start) ext = { session: 'pre', price: last };
        else if ((state === 'POST' || state === 'CLOSED') && period.post && t >= period.post.start) ext = { session: 'post', price: last };
      }
    }
    rows.push(quoteFrom(r.symbol, price, prev, state, 'yahoo', now, ext));
    seen.add(r.symbol);
  }
  return { rows, missing: symbols.filter((s) => !seen.has(s)) };
}

/** 봉(chart, 5년). 없는 심볼이면 null */
export async function yahooBars(symbol: string, interval: Interval, now: number): Promise<BarsRow | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=${interval}&includePrePost=false`;
  const json = (await getJson(url, 'yahoo', 20_000)) as { chart?: { result?: { meta?: { currency?: string }; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[]; low?: (number | null)[] }[] } }[] | null } } | null;
  const res = json?.chart?.result?.[0];
  if (!res?.timestamp?.length) return null;
  const q = res.indicators?.quote?.[0];
  const raw = res.timestamp.map((t, i) => ({ t, c: q?.close?.[i] as number, l: (q?.low?.[i] ?? null) as number | null }));
  return shapeBars(symbol, interval, 'yahoo', res.meta?.currency, raw, now);
}

// ---------------------------------------------------------------- 바이낸스(키 없음, 시세 전용 data-api)

const BINANCE = 'https://data-api.binance.vision/api/v3';
const pairOf = (symbol: string) => `${symbol.replace(/-USD$/, '')}USDT`;

/** 코인 현재가: UTC 하루(tradingDay)의 시가 = 어제 종가 → 일봉과 같은 기준 */
export async function binanceQuotes(symbols: string[], now: number): Promise<{ rows: QuoteRow[]; missing: string[] }> {
  const pairs = symbols.map(pairOf);
  const json = (await getJson(`${BINANCE}/ticker/tradingDay?symbols=${encodeURIComponent(JSON.stringify(pairs))}&timeZone=0`, 'binance')) as { symbol: string; openPrice: string; lastPrice: string }[] | null;
  const rows: QuoteRow[] = [];
  const seen = new Set<string>();
  for (const r of json ?? []) {
    const symbol = symbols[pairs.indexOf(r.symbol)];
    const price = Number(r.lastPrice);
    const prev = Number(r.openPrice);
    if (!symbol || !isNum(price) || !isNum(prev)) continue;
    rows.push(quoteFrom(symbol, price, prev, '24H', 'binance', now));
    seen.add(symbol);
  }
  return { rows, missing: symbols.filter((s) => !seen.has(s)) };
}

export async function binanceBars(symbol: string, interval: Interval, now: number): Promise<BarsRow | null> {
  const k = interval === '1d' ? '1d' : interval === '1wk' ? '1w' : '1M';
  const limit = interval === '1d' ? 1000 : interval === '1wk' ? 262 : 61;
  const get = (end?: number) => getJson(`${BINANCE}/klines?symbol=${pairOf(symbol)}&interval=${k}&limit=${limit}${end ? `&endTime=${end}` : ''}`, 'binance') as Promise<(string | number)[][] | null>;
  let rows = (await get()) ?? [];
  if (!rows.length) return null;
  // 일봉 5년(1,826일)은 두 번에 나눠 받아요(한 번 최대 1,000)
  if (interval === '1d') {
    const older = (await get(Number(rows[0][0]) - 1)) ?? [];
    rows = [...older, ...rows];
  }
  const raw = rows.map((r) => ({ t: Number(r[0]) / 1000, c: Number(r[4]), l: Number(r[3]) }));
  return shapeBars(symbol, interval, 'binance', 'USD', raw, now);
}

// ---------------------------------------------------------------- Frankfurter(ECB 기준 환율, 키 없음)

const FRANKFURTER = 'https://api.frankfurter.dev/v1';

function pairOfFx(symbol: string): { base: string; quote: string } {
  const m = /^([A-Z]{3})([A-Z]{3})=X$/.exec(symbol);
  if (!m) throw new Error(`환율 심볼 꼴이 아님: ${symbol}`);
  return { base: m[1], quote: m[2] };
}

function mondayKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

/** 환율 하나: 5년 일별 값 → 현재가(마지막 두 날) + 일·주·월봉(주·월은 마지막 값이 종가, 그 기간 최솟값이 저가) */
export async function frankfurterAll(symbol: string, now: number): Promise<{ quote: QuoteRow; bars: BarsRow[] } | null> {
  const { base, quote } = pairOfFx(symbol);
  const start = new Date(now - FIVE_YEARS_MS).toISOString().slice(0, 10);
  const json = (await getJson(`${FRANKFURTER}/${start}..?base=${base}&symbols=${quote}`, 'frankfurter', 20_000)) as { rates?: Record<string, Record<string, number>> } | null;
  const days = Object.entries(json?.rates ?? {})
    .map(([day, r]) => ({ day, v: r[quote] }))
    .filter((d) => isNum(d.v))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  if (days.length < 2) return null;
  const toT = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;
  const group = (keyOf: (day: string) => string) => {
    const m = new Map<string, { c: number; l: number }>();
    for (const d of days) {
      const k = keyOf(d.day);
      const g = m.get(k);
      m.set(k, { c: d.v, l: g ? Math.min(g.l, d.v) : d.v });
    }
    return [...m.entries()].map(([k, g]) => ({ t: toT(k), c: g.c, l: g.l }));
  };
  const daily = days.map((d) => ({ t: toT(d.day), c: d.v, l: d.v }));
  const bars = [
    shapeBars(symbol, '1d', 'frankfurter', quote, daily, now),
    shapeBars(symbol, '1wk', 'frankfurter', quote, group(mondayKey), now),
    shapeBars(symbol, '1mo', 'frankfurter', quote, group((d) => `${d.slice(0, 7)}-01`), now),
  ].filter((b): b is BarsRow => b !== null);
  const last = days[days.length - 1];
  const prev = days[days.length - 2];
  return { quote: quoteFrom(symbol, last.v, prev.v, 'CLOSED', 'frankfurter', now), bars };
}

// ---------------------------------------------------------------- alternative.me(코인 공포탐욕, 하루 1회 값)

export async function cryptoFearGreed(): Promise<{ score: number; date: string } | null> {
  const json = (await getJson('https://api.alternative.me/fng/?limit=1', 'alternative')) as { data?: { value?: string; timestamp?: string }[] } | null;
  const d = json?.data?.[0];
  const score = Number(d?.value);
  const ts = Number(d?.timestamp);
  if (!Number.isFinite(score) || !Number.isFinite(ts)) return null;
  return { score: Math.round(Math.max(0, Math.min(100, score))), date: new Date(ts * 1000).toISOString().slice(0, 10) };
}
