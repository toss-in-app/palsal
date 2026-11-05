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
    time(v.fetched_at)
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
  /** 서버가 아직 지켜보지 않는 종목을 '지켜봐 줘'(최대 12개) */
  track(symbols: string[]): Promise<void>;
}
