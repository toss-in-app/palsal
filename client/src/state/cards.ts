import { symbolIndex, type Market } from '../content';
import { toBars, toQuote, type BarsRow, type MarketSource, type QuoteRow } from '../data/types';
import { marketOf, tzOf } from '../lib/format';
import { analyze, withQuote, type Analysis, type Bars } from '../lib/series';
import { readJson, removeItem, writeJson } from '../lib/storage';
import { createStore, useStore } from './store';
import type { WatchItem } from './watch';

/*
 * 카드 시세(내 종목 · 자세히 화면이 함께 써요). 화면을 오가도 남도록 모듈 저장소에 둬요.
 *  - 봉: 기기 Storage `palsal.bars.v1:<watchId>` 에 '그날' 하루 저장 → 없을 때만 palsal_bars 를 읽어요.
 *    '그날'은 서버가 봉을 다시 넣는 시각(시장별, 한국 시간) 기준이라, 하루에 한 번만 받아요.
 *  - 현재가: palsal_quotes 를 보이는 카드 묶음마다, 그리고 보는 동안 5분마다 다시 읽어요.
 *  - 마지막 값: `palsal.cache.v1` — 다음에 열 때 차트 전까지 가격·RSI를 바로 보여 줘요.
 */

export const BARS_KEY_PREFIX = 'palsal.bars.v1:';
export const CACHE_KEY = 'palsal.cache.v1';
/** 서버에 없는 종목은 '지켜봐 줘' 뒤 이만큼 기다렸다 다시 읽어요 */
export const TRACK_RETRY_MS = 6000;
/** 장중인데 현재가가 이보다 오래되면 '갱신이 늦어지고 있어요' */
export const STALE_MS = 20 * 60_000;

/** 서버가 봉을 다시 넣는 시각(한국 시간) — 계약 server.md 작업 daily 가 끝날 즈음 */
const BARS_READY_KST: Record<Market, [number, number]> = { KR: [16, 40], US: [7, 10], CRYPTO: [9, 20], FX: [1, 0] };

/** 봉 저장본의 '그날' — 가장 최근에 지난 갱신 시각의 한국 날짜 */
export function barsDay(market: Market, now = Date.now()): string {
  const [h, m] = BARS_READY_KST[market];
  const kst = new Date(now + 9 * 3_600_000);
  const passed = kst.getUTCHours() * 60 + kst.getUTCMinutes() >= h * 60 + m;
  return new Date(kst.getTime() - (passed ? 0 : 86_400_000)).toISOString().slice(0, 10);
}

export interface LastValue {
  price: number;
  prevClose: number;
  rsi: number | null;
  fetchedAt: number;
}

/** idle = 지난 값만 있음(아직 안 불러옴) */
export type CardStatus = 'idle' | 'loading' | 'ready' | 'pending' | 'error';

export interface CardEntry {
  status: CardStatus;
  /** 서버 봉(현재가 반영 전) */
  bars: Bars | null;
  quote: QuoteRow | null;
  /** 지난번 마지막 값(차트가 오기 전에만 써요) */
  last: LastValue | null;
  /** 봉 + 현재가로 계산한 값 */
  analysis: Analysis | null;
}

export interface CardsState {
  entries: Readonly<Record<string, CardEntry>>;
  /** 가장 최근 현재가 시각(머리의 '15:30 기준') */
  latestAt: number | null;
}

export const cardsStore = createStore<CardsState>({ entries: {}, latestAt: null });

let source: MarketSource | null = null;
let lastValues: Record<string, LastValue> = {};
let lastLoaded = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function setMarketSource(s: MarketSource): void {
  source = s;
}

/** 테스트용 */
export function resetCards(): void {
  cardsStore.set({ entries: {}, latestAt: null });
  lastValues = {};
  lastLoaded = false;
}

function isLast(v: unknown): v is LastValue {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.price === 'number' && o.price > 0 && typeof o.prevClose === 'number' && o.prevClose > 0 && (o.rsi === null || typeof o.rsi === 'number') && Number.isInteger(o.fetchedAt);
}

async function ensureLastValues(): Promise<void> {
  if (lastLoaded) return;
  lastLoaded = true;
  const raw = (await readJson(CACHE_KEY)) as { version?: number; items?: Record<string, unknown> } | null;
  if (raw?.version === 1 && raw.items && typeof raw.items === 'object') {
    lastValues = Object.fromEntries(Object.entries(raw.items).filter((e): e is [string, LastValue] => isLast(e[1])));
  }
  cardsStore.update((s) => {
    const entries = { ...s.entries };
    for (const [id, last] of Object.entries(lastValues)) entries[id] ??= { status: 'idle', bars: null, quote: null, last, analysis: null };
    return { ...s, entries };
  });
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const ids = Object.keys(lastValues).slice(-100);
    void writeJson(CACHE_KEY, { version: 1, items: Object.fromEntries(ids.map((id) => [id, lastValues[id]])) });
  }, 800);
}

function marketOfId(id: string): Market {
  const symbol = id.split('|')[0];
  return marketOf(symbol, symbolIndex.get(symbol));
}

function compute(id: string, bars: Bars | null, quote: QuoteRow | null): Analysis | null {
  if (!bars) return null;
  return analyze(withQuote(bars, quote ? toQuote(quote) : null), marketOfId(id) === 'CRYPTO');
}

/** 여러 카드를 한 번에 고쳐요(화면은 한 번만 다시 그려요) */
function patchMany(list: [string, Partial<CardEntry>][]): void {
  if (!list.length) return;
  cardsStore.update((s) => {
    const entries = { ...s.entries };
    let latestAt = s.latestAt;
    for (const [id, next] of list) {
      const prev: CardEntry = entries[id] ?? { status: 'loading', bars: null, quote: null, last: lastValues[id] ?? null, analysis: null };
      const merged = { ...prev, ...next };
      if ('bars' in next || 'quote' in next) merged.analysis = compute(id, merged.bars, merged.quote);
      if (merged.analysis && 'bars' in next) {
        const q = merged.quote;
        const c = merged.bars?.c ?? [];
        lastValues[id] = {
          price: merged.analysis.price,
          prevClose: q?.prev_close ?? c[c.length - 2] ?? merged.analysis.price,
          rsi: merged.analysis.rsi,
          fetchedAt: q ? Date.parse(q.fetched_at) : Date.now(),
        };
        schedulePersist();
      }
      entries[id] = merged;
      const at = next.quote ? Date.parse(next.quote.fetched_at) : null;
      if (at && (!latestAt || at > latestAt)) latestAt = at;
    }
    return { entries, latestAt };
  });
}

function patch(id: string, next: Partial<CardEntry>): void {
  patchMany([[id, next]]);
}

interface BarsCacheValue {
  version: 1;
  day: string;
  fetchedAt: number;
  t: number[];
  c: number[];
  l: number[];
  high5y: number;
}

function isBarsCache(v: unknown): v is BarsCacheValue {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.version === 1 && typeof o.day === 'string' && Array.isArray(o.t) && Array.isArray(o.c) && Array.isArray(o.l) && o.t.length > 0 && o.c.length === o.t.length && o.l.length === o.t.length && typeof o.high5y === 'number';
}

async function readBarsCache(item: WatchItem, now: number): Promise<Bars | null> {
  const v = await readJson(BARS_KEY_PREFIX + item.id);
  const market = marketOfId(item.id);
  if (!isBarsCache(v) || v.day !== barsDay(market, now)) return null;
  return { interval: item.interval, tz: tzOf(market), t: v.t, c: v.c, l: v.l, high5y: v.high5y };
}

function writeBarsCache(row: BarsRow, now: number): void {
  const value: BarsCacheValue = { version: 1, day: barsDay(marketOfId(row.key), now), fetchedAt: now, t: row.t, c: row.c, l: row.l, high5y: row.high5y };
  void writeJson(BARS_KEY_PREFIX + row.key, value);
}

const inflight = new Set<string>();

/** 묶음 하나 불러오기(이미 받은 카드는 건너뛰어요). 서버에 없는 종목은 지켜봐 달라고 한 뒤 한 번 더 읽어요 */
export async function loadCards(items: WatchItem[], retry = true): Promise<{ n: number; stale: number; error: number }> {
  await ensureLastValues();
  const todo = items.filter((it) => !inflight.has(it.id) && cardsStore.get().entries[it.id]?.status !== 'ready');
  if (!todo.length || !source) return { n: 0, stale: 0, error: 0 };
  todo.forEach((it) => inflight.add(it.id));
  const now = Date.now();
  try {
    patchMany(todo.map((it) => [it.id, { status: 'loading' }]));

    const cached = await Promise.all(todo.map((it) => readBarsCache(it, now)));
    const need = todo.filter((_, i) => !cached[i]);
    const barsById = new Map<string, Bars>();
    todo.forEach((it, i) => cached[i] && barsById.set(it.id, cached[i]!));

    let barsFailed = false;
    if (need.length) {
      try {
        for (const row of await source.bars(need.map((it) => it.id))) {
          barsById.set(row.key, toBars(row));
          writeBarsCache(row, now);
        }
      } catch {
        barsFailed = true;
      }
    }

    const symbols = [...new Set(todo.map((it) => it.symbol))];
    const quotes = new Map<string, QuoteRow>();
    let quotesFailed = false;
    try {
      for (const q of await source.quotes(symbols)) quotes.set(q.symbol, q);
    } catch {
      quotesFailed = true;
    }

    const missing: string[] = [];
    const updates: [string, Partial<CardEntry>][] = [];
    let stale = 0;
    let error = 0;
    for (const it of todo) {
      const bars = barsById.get(it.id) ?? null;
      const quote = quotes.get(it.symbol) ?? null;
      if (bars) {
        updates.push([it.id, { status: 'ready', bars, quote }]);
        if (!quote) stale += 1;
      } else if (!barsFailed && !quotesFailed && retry) {
        missing.push(it.symbol);
        updates.push([it.id, { status: 'pending', quote }]);
      } else {
        updates.push([it.id, { status: 'error', quote }]);
        error += 1;
      }
    }
    patchMany(updates);

    if (missing.length) {
      try {
        await source.track([...new Set(missing)]);
      } catch {
        /* 지켜봐 달라는 요청이 실패해도 한 번 더 읽어 봐요 */
      }
      setTimeout(() => {
        const again = todo.filter((it) => cardsStore.get().entries[it.id]?.status === 'pending');
        again.forEach((it) => inflight.delete(it.id));
        void loadCards(again, false);
      }, TRACK_RETRY_MS);
    }
    return { n: todo.length, stale, error };
  } finally {
    todo.forEach((it) => cardsStore.get().entries[it.id]?.status !== 'pending' && inflight.delete(it.id));
  }
}

/** 실패한 카드 다시 시도 */
export function retryCard(item: WatchItem): Promise<unknown> {
  patch(item.id, { status: 'loading' });
  return loadCards([item]);
}

/** 받은 카드들의 현재가만 다시 읽기(새로고침 · 5분마다). 결과: ok · stale(일부 못 받음) · error */
export async function refreshQuotes(items: WatchItem[]): Promise<'ok' | 'stale' | 'error'> {
  if (!source) return 'error';
  const ready = items.filter((it) => cardsStore.get().entries[it.id]?.bars);
  const symbols = [...new Set(ready.map((it) => it.symbol))];
  if (!symbols.length) return 'ok';
  try {
    const quotes = new Map((await source.quotes(symbols)).map((q) => [q.symbol, q] as const));
    patchMany(ready.flatMap((it): [string, Partial<CardEntry>][] => (quotes.has(it.symbol) ? [[it.id, { quote: quotes.get(it.symbol)! }]] : [])));
    return quotes.size < symbols.length ? 'stale' : 'ok';
  } catch {
    return 'error';
  }
}

/** 장중인데 현재가가 20분보다 오래됐는지 */
export function isStale(quote: QuoteRow | null, now = Date.now()): boolean {
  if (!quote) return false;
  if (quote.market_state === 'CLOSED' || quote.market_state === 'PRE') return false;
  return now - Date.parse(quote.fetched_at) > STALE_MS;
}

/** 빼낸 종목의 봉 저장본 지우기 */
export function forgetCard(id: string): void {
  cardsStore.update((s) => {
    const entries = { ...s.entries };
    delete entries[id];
    return { ...s, entries };
  });
  delete lastValues[id];
  schedulePersist();
  void removeItem(BARS_KEY_PREFIX + id);
}

export function useCards(): CardsState {
  return useStore(cardsStore);
}

/** 화면 걸러 보기에 쓰는 RSI(받은 값 → 지난 값) */
export function rsiOfEntry(entry: CardEntry | undefined, id: string): number | null {
  if (entry?.analysis) return entry.analysis.rsi;
  return entry?.last?.rsi ?? lastValues[id]?.rsi ?? null;
}

export async function preloadLastValues(): Promise<Record<string, LastValue>> {
  await ensureLastValues();
  return lastValues;
}
