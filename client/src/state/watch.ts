import { SYMBOL_RE } from '../data/types';
import type { Interval } from '../lib/series';
import { readJson, writeJson } from '../lib/storage';
import { createStore, useStore } from './store';

/** 계약 state.schema.json `palsal.watch.v1` — 배열 순서 = 화면 순서. 같은 종목도 봉 단위가 다르면 따로 */
export const WATCH_KEY = 'palsal.watch.v1';
export const WATCH_MAX = 100;

export interface WatchItem {
  /** '<symbol>|<interval>' */
  id: string;
  symbol: string;
  interval: Interval;
  addedAt: number;
}

export interface WatchState {
  ready: boolean;
  items: WatchItem[];
}

export const watchId = (symbol: string, interval: Interval) => `${symbol}|${interval}`;

function isItem(v: unknown): v is WatchItem {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.symbol === 'string' &&
    SYMBOL_RE.test(o.symbol) &&
    (o.interval === '1d' || o.interval === '1wk' || o.interval === '1mo') &&
    o.id === `${o.symbol}|${o.interval}` &&
    Number.isInteger(o.addedAt) &&
    (o.addedAt as number) >= 0 &&
    Object.keys(o).length === 4
  );
}

/** 모양이 다르면 빈 목록(계약: 그 키를 빈 값으로 취급) */
export function parseWatch(json: unknown): WatchItem[] {
  if (typeof json !== 'object' || json === null) return [];
  const o = json as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.items) || o.items.length > WATCH_MAX || !o.items.every(isItem)) return [];
  const seen = new Set<string>();
  return (o.items as WatchItem[]).filter((it) => !seen.has(it.id) && seen.add(it.id));
}

export const watchStore = createStore<WatchState>({ ready: false, items: [] });

function persist(items: WatchItem[]): Promise<void> {
  return writeJson(WATCH_KEY, { version: 1, items });
}

/**
 * 처음 연 날 미리 담아 두는 예시 종목 — 원본과 같은 4개(나스닥 100 ETF · S&P 500 ETF · 삼성전자 · SK하이닉스, 일봉).
 * 설정도 담은 종목도 저장된 적이 없을 때 한 번만. 나중에 다 빼도 다시 채우지 않아요(원본과 같음).
 */
export const STARTER: { symbol: string; interval: Interval }[] = [
  { symbol: 'QQQ', interval: '1d' },
  { symbol: 'SPY', interval: '1d' },
  { symbol: '005930.KS', interval: '1d' },
  { symbol: '000660.KS', interval: '1d' },
];

/** 담은 종목을 읽어요. firstOpen(설정이 처음 만들어진 날)이고 담은 종목도 저장된 적이 없으면 예시 종목을 넣어요 */
export async function loadWatch(firstOpen = false, now = Date.now()): Promise<void> {
  const raw = await readJson(WATCH_KEY);
  let items = parseWatch(raw);
  if (firstOpen && raw === null) {
    items = STARTER.map((e, i) => ({ id: watchId(e.symbol, e.interval), symbol: e.symbol, interval: e.interval, addedAt: now + i }));
    void persist(items);
  }
  watchStore.set({ ready: true, items });
}

/** 맨 아래에 더해요. 이미 담긴 것·100개를 넘는 것은 빼고, 실제로 더한 수를 돌려줘요 */
export function addWatch(entries: { symbol: string; interval: Interval }[], now = Date.now()): number {
  const prev = watchStore.get().items;
  const have = new Set(prev.map((it) => it.id));
  const added: WatchItem[] = [];
  for (const e of entries) {
    const id = watchId(e.symbol, e.interval);
    if (have.has(id) || prev.length + added.length >= WATCH_MAX) continue;
    have.add(id);
    added.push({ id, symbol: e.symbol, interval: e.interval, addedAt: now });
  }
  if (!added.length) return 0;
  const items = [...prev, ...added];
  watchStore.set({ ready: true, items });
  void persist(items);
  return added.length;
}

export function removeWatch(id: string): void {
  const items = watchStore.get().items.filter((it) => it.id !== id);
  watchStore.set({ ready: true, items });
  void persist(items);
}

export function useWatch(): WatchState {
  return useStore(watchStore);
}
