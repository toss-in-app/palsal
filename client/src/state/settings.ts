import { readJson, writeJson } from '../lib/storage';
import { createStore, useStore } from './store';

/** 계약 state.schema.json `palsal.settings.v1` */
export const SETTINGS_KEY = 'palsal.settings.v1';

export type Filter = 'all' | 'low' | 'high';

export interface Settings {
  version: 1;
  filter: Filter;
  autoRefresh: boolean;
  firstOpenAt: number;
  notification: { promptDismissedAt: number | null; lastResult: null | 'agreed' | 'declined' | 'error' | 'unsupported' };
  /** 자세히 차트를 처음 다룬 때(밀기·벌리기·누르고 있기). null 이면 차트 아래 쓰는 법 한 줄을 보여 줘요 */
  chartUsedAt: number | null;
}

export function defaultSettings(now = Date.now()): Settings {
  return {
    version: 1,
    filter: 'all',
    autoRefresh: true,
    firstOpenAt: now,
    notification: { promptDismissedAt: null, lastResult: null },
    chartUsedAt: null,
  };
}

/** 모양이 다르면 기본값(처음 연 날은 지금) */
export function parseSettings(json: unknown, now = Date.now()): Settings {
  const d = defaultSettings(now);
  if (typeof json !== 'object' || json === null) return d;
  const o = json as Record<string, unknown>;
  const noti = (o.notification ?? {}) as Record<string, unknown>;
  const ok =
    o.version === 1 &&
    (o.filter === 'all' || o.filter === 'low' || o.filter === 'high') &&
    typeof o.autoRefresh === 'boolean' &&
    Number.isInteger(o.firstOpenAt) &&
    (noti.promptDismissedAt === null || Number.isInteger(noti.promptDismissedAt)) &&
    [null, 'agreed', 'declined', 'error', 'unsupported'].includes(noti.lastResult as string | null) &&
    (o.chartUsedAt === undefined || o.chartUsedAt === null || Number.isInteger(o.chartUsedAt));
  // chartUsedAt 은 뒤에 더한 칸(2026-11-06) — 예전 저장본엔 없어요
  return ok ? { ...(json as Settings), chartUsedAt: (o.chartUsedAt as number | null | undefined) ?? null } : d;
}

export const settingsStore = createStore<Settings>(defaultSettings());

/** 설정을 읽어요. 저장된 설정이 아예 없으면(처음 연 날) true */
export async function loadSettings(): Promise<boolean> {
  const raw = await readJson(SETTINGS_KEY);
  const s = parseSettings(raw);
  settingsStore.set(s);
  if (raw === null) void writeJson(SETTINGS_KEY, s);
  return raw === null;
}

export function updateSettings(patch: Partial<Omit<Settings, 'version'>>): void {
  const next = { ...settingsStore.get(), ...patch };
  settingsStore.set(next);
  void writeJson(SETTINGS_KEY, next);
}

export function useSettings(): Settings {
  return useStore(settingsStore);
}
