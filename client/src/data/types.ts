import type { Bars, ExchangeTz, Interval, QuoteLike } from '../lib/series';

/*
 * 서버 표(Supabase PostgREST)가 돌려주는 행 — 계약 quotes.schema.json · bars.schema.json.
 * 받은 JSON 은 아래 검사를 통과한 행만 써요(모양이 다른 행은 버려요).
 */

export type MarketState = QuoteLike['marketState'];

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
  /** 원천의 마지막 체결 시각(v1.13). 한국 주식·지수는 야후가 약 20분 늦게 줘요 — 화면 '기준' 시각. 예전 서버 행엔 없어요 */
  market_time?: string | null;
}

/** 화면에 쓰는 '기준' 시각: 원천 체결 시각, 없으면 서버가 받은 시각 */
export function quoteTimeOf(q: Pick<QuoteRow, 'fetched_at' | 'market_time'>): number {
  const m = q.market_time ? Date.parse(q.market_time) : NaN;
  return Number.isFinite(m) ? m : Date.parse(q.fetched_at);
}

export interface BarsRow {
  key: string;
  symbol: string;
  interval: Interval;
  currency: 'KRW' | 'USD' | 'JPY';
  tz: ExchangeTz;
  source: 'yahoo' | 'binance' | 'frankfurter';
  t: number[];
  c: number[];
  l: number[];
  high5y: number;
  updated_at: string;
}

export const SYMBOL_RE = /^\^?[A-Z0-9.=-]{1,20}$/;
const STATES = ['PRE', 'REGULAR', 'POST', 'CLOSED', '24H'];
const SOURCES = ['yahoo', 'binance', 'frankfurter'];
const INTERVALS = ['1d', '1wk', '1mo'];
const TZS = ['Asia/Seoul', 'America/New_York', 'UTC'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const pos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const time = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function isQuoteRow(v: unknown): v is QuoteRow {
  if (!isObj(v)) return false;
  return (
    typeof v.symbol === 'string' &&
    SYMBOL_RE.test(v.symbol) &&
    pos(v.price) &&
    pos(v.prev_close) &&
    num(v.change_pct) &&
    STATES.includes(v.market_state as string) &&
    (v.ext_session === null || v.ext_session === 'pre' || v.ext_session === 'post') &&
    (v.ext_price === null || pos(v.ext_price)) &&
    (v.ext_change_pct === null || num(v.ext_change_pct)) &&
    SOURCES.includes(v.source as string) &&
    time(v.fetched_at) &&
    (v.market_time === undefined || v.market_time === null || time(v.market_time))
  );
}

export function isBarsRow(v: unknown): v is BarsRow {
  if (!isObj(v)) return false;
  const { t, c, l } = v;
  if (!Array.isArray(t) || !Array.isArray(c) || !Array.isArray(l)) return false;
  if (t.length < 1 || t.length > 530 || c.length !== t.length || l.length !== t.length) return false;
  for (let i = 0; i < t.length; i++) {
    if (!Number.isInteger(t[i]) || (i > 0 && (t[i] as number) <= (t[i - 1] as number))) return false;
    if (!pos(c[i]) || !pos(l[i])) return false;
  }
  return (
    typeof v.symbol === 'string' &&
    SYMBOL_RE.test(v.symbol) &&
    INTERVALS.includes(v.interval as string) &&
    v.key === `${v.symbol}|${v.interval as string}` &&
    TZS.includes(v.tz as string) &&
    SOURCES.includes(v.source as string) &&
    pos(v.high5y) &&
    time(v.updated_at)
  );
}

/** 배열에서 모양이 맞는 행만 */
export function validRows<T>(json: unknown, check: (v: unknown) => v is T): T[] {
  return Array.isArray(json) ? json.filter(check) : [];
}

export function toBars(row: BarsRow): Bars {
  return { interval: row.interval, tz: row.tz, t: row.t, c: row.c, l: row.l, high5y: row.high5y };
}

export function toQuote(row: QuoteRow): QuoteLike {
  return { price: row.price, marketState: row.market_state, fetchedAt: Date.parse(row.fetched_at) };
}

/** 시세 출처(개발 중엔 예시 데이터, 출시 번들은 Supabase) */
export interface MarketSource {
  quotes(symbols: string[]): Promise<QuoteRow[]>;
  bars(keys: string[]): Promise<BarsRow[]>;
  /**
   * '지켜봐 줘'(최대 12개). 서버가 지금 새로 받기 시작한 종목(새 종목 · 14일 넘게 빠져 있던 종목 · 현재가가 없는 종목)을 돌려줘요
   * — 그 종목의 지금 봉은 오래됐을 수 있어 잠깐 뒤 다시 읽어요(계약 v1.12).
   */
  track(symbols: string[]): Promise<string[]>;
  /** 시장 탭(공포탐욕 3 · 시총 상위 RSI · 30 아래). 없거나 모양이 다르면 null */
  market(): Promise<MarketPayload | null>;
}

/* ── 시장(계약 market.schema.json = palsal_market.payload) ── */

export interface FearGreed {
  score: number;
  label: '극단적 공포' | '공포' | '중립' | '탐욕' | '극단적 탐욕';
  basis: string;
  attribution?: string;
  sourceDate?: string;
}

export interface MarketRow {
  symbol: string;
  rank: number;
  rsi: number | null;
  close: number | null;
  changePct: number | null;
}

export interface MarketPayload {
  schema: 1;
  asOf: string;
  computedAt: string;
  stale: boolean;
  universeVersion: string;
  fearGreed: { kr: FearGreed; us: FearGreed; crypto: FearGreed };
  /** crypto = 주요 코인(v1.15, 서버가 아직 안 넣었으면 없음) */
  universe: { kr: MarketRow[]; us: MarketRow[]; crypto?: MarketRow[] };
  /** universe 의 한국·미국 중 일봉 RSI ≤ 30, RSI 낮은 순(코인은 없음 — 화면은 universe 줄로 직접 골라요) */
  low: string[];
}

const FG_LABELS = ['극단적 공포', '공포', '중립', '탐욕', '극단적 탐욕'];

function isFearGreed(v: unknown): v is FearGreed {
  if (!isObj(v)) return false;
  return Number.isInteger(v.score) && (v.score as number) >= 0 && (v.score as number) <= 100 && FG_LABELS.includes(v.label as string) && typeof v.basis === 'string';
}

function isRow(v: unknown): v is MarketRow {
  if (!isObj(v)) return false;
  const opt = (x: unknown) => x === null || num(x);
  return typeof v.symbol === 'string' && SYMBOL_RE.test(v.symbol) && Number.isInteger(v.rank) && opt(v.rsi) && (v.close === null || pos(v.close)) && opt(v.changePct);
}

/** 모양이 맞으면 그대로, 아니면 null(화면은 '시장 정보를 불러오지 못했어요') */
export function asMarketPayload(v: unknown): MarketPayload | null {
  if (!isObj(v) || v.schema !== 1 || !time(v.asOf) || !time(v.computedAt) || typeof v.stale !== 'boolean' || typeof v.universeVersion !== 'string') return null;
  const fg = v.fearGreed;
  const uni = v.universe;
  if (!isObj(fg) || !isFearGreed(fg.kr) || !isFearGreed(fg.us) || !isFearGreed(fg.crypto)) return null;
  if (!isObj(uni) || !Array.isArray(uni.kr) || !Array.isArray(uni.us) || !uni.kr.every(isRow) || !uni.us.every(isRow)) return null;
  if (uni.crypto !== undefined && !(Array.isArray(uni.crypto) && uni.crypto.every(isRow))) return null;
  if (!Array.isArray(v.low) || !v.low.every((s) => typeof s === 'string' && SYMBOL_RE.test(s))) return null;
  return v as unknown as MarketPayload;
}
