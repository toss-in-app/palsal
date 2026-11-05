import { recentChanges, type ChangeKind } from '../lib/events';
import { exchangeDay, type Analysis, type Bars } from '../lib/series';
import { readJson, writeJson } from '../lib/storage';
import { createStore, useStore } from './store';
import { watchStore } from './watch';

/*
 * 최근 바뀐 것(계약 state.schema.json `palsal.changes.v1`).
 * 카드 값을 계산할 때마다 그 종목의 봉에서 최근 7일 안의 일(RSI 30 아래·70 위 진입, 60/120 교차, 5년 최고가)을 다시 찾아
 * 기록에 합쳐요. 같은 종목·종류·날짜는 한 번만, 7일 지나면 지우고, 최대 50건.
 * 앱을 보는 동안 새로 생긴 RSI 진입만 토스트로 알려요(원본처럼 30·70 진입만). 앱을 열 때는 요약 한 번(화면 쪽).
 */

export const CHANGES_KEY = 'palsal.changes.v1';
export const CHANGES_MAX = 50;
export const CHANGES_DAYS = 7;
const DAY_MS = 86_400_000;

export interface ChangeItem {
  kind: ChangeKind;
  watchId: string;
  /** 그 일이 일어난 봉의 날짜(거래소 현지) */
  date: string;
  /** 앱이 알아챈 시각 */
  at: number;
  from: number | null;
  to: number | null;
}

export const changesStore = createStore<ChangeItem[]>([]);

const KINDS: ChangeKind[] = ['rsi_low_enter', 'rsi_high_enter', 'ma_cross_up', 'ma_cross_down', 'high5y'];
const keyOf = (c: Pick<ChangeItem, 'watchId' | 'kind' | 'date'>) => `${c.watchId}|${c.kind}|${c.date}`;

function isItem(v: unknown): v is ChangeItem {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x));
  return KINDS.includes(o.kind as ChangeKind) && typeof o.watchId === 'string' && typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Number.isInteger(o.at) && n(o.from) && n(o.to);
}

/** 7일보다 오래된 것 · 담지 않은 종목 · 중복을 빼고 새 것부터 50건 */
export function tidy(items: ChangeItem[], watched: Set<string>, now = Date.now()): ChangeItem[] {
  const oldest = new Date(now + 9 * 3_600_000 - CHANGES_DAYS * DAY_MS).toISOString().slice(0, 10);
  const seen = new Set<string>();
  return items
    .filter((c) => watched.has(c.watchId) && c.date >= oldest)
    .sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1))
    .filter((c) => !seen.has(keyOf(c)) && seen.add(keyOf(c)))
    .slice(0, CHANGES_MAX);
}

const watchedIds = () => new Set(watchStore.get().items.map((it) => it.id));

export async function loadChanges(): Promise<void> {
  const raw = (await readJson(CHANGES_KEY)) as { version?: number; items?: unknown[] } | null;
  const items = raw?.version === 1 && Array.isArray(raw.items) ? raw.items.filter(isItem) : [];
  changesStore.set(tidy(items, watchedIds()));
}

function persist(items: ChangeItem[]): void {
  void writeJson(CHANGES_KEY, { version: 1, items });
}

/** 이번 세션에 한 번이라도 계산한 종목(그 뒤에 새로 생긴 진입만 토스트) */
const evaluated = new Set<string>();
const listeners = new Set<(fresh: ChangeItem[]) => void>();

/** 보는 동안 새로 생긴 RSI 30 아래·70 위 진입 */
export function onLiveChanges(listener: (fresh: ChangeItem[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 테스트용 */
export function resetChanges(): void {
  changesStore.set([]);
  evaluated.clear();
}

/**
 * 계산한 카드들의 최근 변화를 기록에 합쳐요. bars 는 현재가를 반영한 봉.
 * 돌려주는 값 = 이번에 새로 들어간 기록.
 */
export function recordChanges(list: { id: string; bars: Bars; analysis: Analysis }[], now = Date.now()): ChangeItem[] {
  const watched = watchedIds();
  const prev = changesStore.get();
  const have = new Set(prev.map(keyOf));
  const fresh: ChangeItem[] = [];
  const live: ChangeItem[] = [];
  const since = Math.floor((now - CHANGES_DAYS * DAY_MS) / 1000);
  for (const { id, bars, analysis } of list) {
    if (!watched.has(id)) continue;
    const first = !evaluated.has(id);
    evaluated.add(id);
    for (const e of recentChanges(bars, analysis, since)) {
      const item: ChangeItem = { kind: e.kind, watchId: id, date: exchangeDay(e.t * 1000, bars.tz), at: now, from: e.from ?? null, to: e.to ?? null };
      if (have.has(keyOf(item))) continue;
      have.add(keyOf(item));
      fresh.push(item);
      if (!first && (e.kind === 'rsi_low_enter' || e.kind === 'rsi_high_enter')) live.push(item);
    }
  }
  if (!fresh.length) return [];
  const next = tidy([...fresh, ...prev], watched, now);
  changesStore.set(next);
  persist(next);
  if (live.length) listeners.forEach((l) => l(live));
  return fresh;
}

/** 종목을 빼면 그 종목의 기록도 빼요 */
export function dropChanges(id: string): void {
  const next = changesStore.get().filter((c) => c.watchId !== id);
  changesStore.set(next);
  persist(next);
}

export function useChanges(): ChangeItem[] {
  return useStore(changesStore);
}

/** '오늘' · '어제' · '10월 28일'(한국 날짜 기준으로 셈) */
export function relativeDay(date: string, now = Date.now()): string {
  const today = new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
  const yesterday = new Date(now + 9 * 3_600_000 - DAY_MS).toISOString().slice(0, 10);
  if (date === today) return '오늘';
  if (date === yesterday) return '어제';
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}
