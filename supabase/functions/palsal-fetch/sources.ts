/**
 * 출처 어댑터 — 야후(비공식: 주식·ETF·지수·환율) · 바이낸스(코인) · alternative.me(코인 공포탐욕) (계약 contract/server.md '출처 바꾸기').
 * 정직한 User-Agent 만 써요. 브라우저 흉내·쿠키 재사용·IP 돌리기 같은 차단 우회는 하지 않아요.
 * 모든 가격은 넣기 전에 반올림(계약 v1.9). 봉은 일·주·월 모두 5년(원본 RSIngTime 과 같은 범위, high5y = 그 종가 최댓값).
 * 2026-11-06(계약 v1.13): 환율도 야후로(장중 5분마다, 예전엔 Frankfurter 하루 1번) · 현재가에 원천 체결 시각(market_time).
 */
import { MAX_BARS, marketOfSymbol, roundPct, roundPrice, tzOfMarket, type Interval, type Market, type MarketState } from '../_shared/calc.ts';

const UA = Deno.env.get('USER_AGENT') ?? 'palsal/1.0';
const FIVE_YEARS_MS = 5 * 365.25 * 86_400_000;

export type Source = 'yahoo' | 'binance' | 'alternative';

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
  source: 'yahoo' | 'binance';
  fetched_at: string;
  /** 원천의 마지막 체결 시각(프리·애프터 값이 있으면 그 시각). 한국 주식·지수는 야후가 약 20분 늦게 줘요 */
  market_time: string | null;
}

export interface BarsRow {
  key: string;
  symbol: string;
  interval: Interval;
  currency: 'KRW' | 'USD' | 'JPY';
  tz: 'Asia/Seoul' | 'America/New_York' | 'UTC';
  source: 'yahoo' | 'binance';
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

function quoteFrom(symbol: string, price: number, prev: number, state: MarketState, source: QuoteRow['source'], now: number, marketTime: number | null, ext?: { session: 'pre' | 'post'; price: number }): QuoteRow {
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
    market_time: marketTime ? iso(Math.min(marketTime, now)) : null,
  };
}

/** 기간을 가르는 시간대 — 환율은 야후가 런던 시간으로 봉을 끊어요 */
const PERIOD_TZ: Record<Market, string> = { KR: 'Asia/Seoul', US: 'America/New_York', CRYPTO: 'UTC', FX: 'Europe/London' };
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function localDay(ms: number, tz: string): string {
  let f = dayFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormatters.set(tz, f);
  }
  return f.format(new Date(ms));
}

/** 그 날이 든 기간의 이름: 일봉 = 날짜, 주봉 = 그 주 월요일, 월봉 = 'YYYY-MM' */
function periodKey(day: string, interval: Interval): string {
  if (interval === '1d') return day;
  if (interval === '1mo') return day.slice(0, 7);
  const d = new Date(`${day}T00:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 봉 꼴 정리: 종가 없는 칸 빼고 · 시각 오름차순 · 반올림 · 최근 530 · high5y 는 5년 안 종가 최댓값.
 * 같은 날·주·달 칸은 하나로 합쳐요(야후는 주봉·월봉 끝에 '지금' 칸을 하나 더 줘요) — 시각은 그 기간 첫 칸, 종가는 마지막 칸, 저가는 가장 낮은 값.
 * 환율은 런던 날짜의 UTC 0시로 맞춰요(앱은 환율 봉을 UTC 날짜로 봐요 — 서머타임엔 야후 시각이 전날 23시라서).
 */
function shapeBars(symbol: string, interval: Interval, source: BarsRow['source'], currency: string | undefined, raw: { t: number; c: number; l: number | null }[], now: number): BarsRow | null {
  const since = (now - FIVE_YEARS_MS) / 1000;
  const market = marketOfSymbol(symbol);
  const tz = PERIOD_TZ[market];
  const rows = raw.filter((b) => isNum(b.c) && Number.isFinite(b.t) && b.t >= since).sort((x, y) => x.t - y.t);
  const byPeriod = new Map<string, { t: number; c: number; l: number }>();
  for (const b of rows) {
    const day = localDay(b.t * 1000, tz);
    const key = periodKey(day, interval);
    const c = roundPrice(symbol, b.c);
    const l = isNum(b.l) ? Math.min(roundPrice(symbol, b.l), c) : c;
    const t = market === 'FX' ? Date.parse(`${interval === '1mo' ? `${key}-01` : key}T00:00:00Z`) / 1000 : Math.floor(b.t);
    const prev = byPeriod.get(key);
    byPeriod.set(key, prev ? { t: prev.t, c, l: Math.min(prev.l, l) } : { t, c, l });
  }
  const bars = [...byPeriod.values()];
  if (!bars.length) return null;
  const high5y = Math.max(...bars.map((x) => x.c));
  const keep = bars.slice(-MAX_BARS);
  const cur = currency === 'KRW' || currency === 'USD' || currency === 'JPY' ? currency : market === 'KR' || market === 'FX' ? 'KRW' : 'USD';
  return {
    key: `${symbol}|${interval}`,
    symbol,
    interval,
    currency: cur,
    tz: tzOfMarket(market),
    source,
    t: keep.map((x) => x.t),
    c: keep.map((x) => x.c),
    l: keep.map((x) => x.l),
    high5y,
    updated_at: iso(now),
  };
}

/** 외환 시장이 열린 때(대략 일 21:00 UTC ~ 금 22:00 UTC) — 그 밖엔 환율 현재가를 CLOSED 로 */
export function fxOpen(ms: number): boolean {
  const d = new Date(ms);
  const wd = d.getUTCDay();
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (wd === 6) return false;
  if (wd === 0) return m >= 21 * 60;
  if (wd === 5) return m < 22 * 60;
  return true;
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

/**
 * 장 상태. 한국은 시간외를 따로 보이지 않아 정규장 밖은 PRE(장 전)·CLOSED.
 * 정규장 시간인데 오늘 체결이 아직 없으면: 처음 40분은 장중(원천이 늦게 줘요 — 한국 약 20분), 그 뒤에도 없으면 휴장일이라 CLOSED.
 */
function stateOf(meta: SparkMeta, nowS: number, us: boolean): MarketState {
  const p = meta.currentTradingPeriod;
  const inside = (x?: Period) => !!x && x.start <= nowS && nowS < x.end;
  if (inside(p?.regular)) {
    if ((meta.regularMarketTime ?? 0) >= p!.regular!.start) return 'REGULAR';
    return nowS - p!.regular!.start < 40 * 60 ? 'REGULAR' : 'CLOSED';
  }
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
    const market = marketOfSymbol(r.symbol);
    const us = market === 'US';
    const state: MarketState = market === 'FX' ? (fxOpen(now) ? 'REGULAR' : 'CLOSED') : stateOf(meta, nowS, us);
    let ext: { session: 'pre' | 'post'; price: number } | undefined;
    let extTime: number | null = null;
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
        if (ext) extTime = t * 1000;
      }
    }
    const baseTime = isNum(meta.regularMarketTime) ? meta.regularMarketTime * 1000 : null;
    const marketTime = extTime !== null && (baseTime === null || extTime > baseTime) ? extTime : baseTime;
    rows.push(quoteFrom(r.symbol, price, prev, state, 'yahoo', now, marketTime, ext));
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
  const json = (await getJson(`${BINANCE}/ticker/tradingDay?symbols=${encodeURIComponent(JSON.stringify(pairs))}&timeZone=0`, 'binance')) as { symbol: string; openPrice: string; lastPrice: string; closeTime?: number }[] | null;
  const rows: QuoteRow[] = [];
  const seen = new Set<string>();
  for (const r of json ?? []) {
    const symbol = symbols[pairs.indexOf(r.symbol)];
    const price = Number(r.lastPrice);
    const prev = Number(r.openPrice);
    if (!symbol || !isNum(price) || !isNum(prev)) continue;
    rows.push(quoteFrom(symbol, price, prev, '24H', 'binance', now, Number.isFinite(r.closeTime) ? (r.closeTime as number) : now));
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

// ---------------------------------------------------------------- alternative.me(코인 공포탐욕, 하루 1회 값)

export async function cryptoFearGreed(): Promise<{ score: number; date: string } | null> {
  const json = (await getJson('https://api.alternative.me/fng/?limit=1', 'alternative')) as { data?: { value?: string; timestamp?: string }[] } | null;
  const d = json?.data?.[0];
  const score = Number(d?.value);
  const ts = Number(d?.timestamp);
  if (!Number.isFinite(score) || !Number.isFinite(ts)) return null;
  return { score: Math.round(Math.max(0, Math.min(100, score))), date: new Date(ts * 1000).toISOString().slice(0, 10) };
}
