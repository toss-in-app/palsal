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
  ads: { lastInterstitialDate: string | null };
  notification: { promptDismissedAt: number | null; lastResult: null | 'agreed' | 'declined' | 'error' | 'unsupported' };
}

export function defaultSettings(now = Date.now()): Settings {
  return {
    version: 1,
    filter: 'all',
    autoRefresh: true,
    firstOpenAt: now,
    ads: { lastInterstitialDate: null },
    notification: { promptDismissedAt: null, lastResult: null },
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 모양이 다르면 기본값(처음 연 날은 지금) */
export function parseSettings(json: unknown, now = Date.now()): Settings {
  const d = defaultSettings(now);
  if (typeof json !== 'object' || json === null) return d;
  const o = json as Record<string, unknown>;
  const ads = (o.ads ?? {}) as Record<string, unknown>;
  const noti = (o.notification ?? {}) as Record<string, unknown>;
  const ok =
    o.version === 1 &&
    (o.filter === 'all' || o.filter === 'low' || o.filter === 'high') &&
    typeof o.autoRefresh === 'boolean' &&
    Number.isInteger(o.firstOpenAt) &&
    (ads.lastInterstitialDate === null || (typeof ads.lastInterstitialDate === 'string' && DATE.test(ads.lastInterstitialDate))) &&
    (noti.promptDismissedAt === null || Number.isInteger(noti.promptDismissedAt)) &&
    [null, 'agreed', 'declined', 'error', 'unsupported'].includes(noti.lastResult as string | null);
  return ok ? (json as Settings) : d;
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
