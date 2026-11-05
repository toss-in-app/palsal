import { readJson, writeJson } from '../lib/storage';
import { createStore, useStore } from '../state/store';
import {
  bundledContent,
  bundledSymbols,
  bundledUniverse,
  compareContentVersion,
  isContentFile,
  isSymbolsFile,
  isUniverseFile,
  refillSymbolIndex,
  STATIC_BASE_URL,
  type ContentFile,
  type SymbolsFile,
  type UniverseFile,
} from '.';

/*
 * 정적 콘텐츠 원격 갱신(흐름 문서 '첫 렌더', 계약 events.md '정적 파일') — byeol-today 와 같은 방식을 세 파일에.
 * 번들 동봉본으로 바로 그리고 → 기기 저장본(그날 받은 원격본)이 있으면 바꿔 끼우고 → 오늘 아직 안 물어봤으면
 * GitHub Pages 에 If-None-Match(ETag)로 한 번 물어요. 304 면 날짜만, 200 이면 모양·minClientVersion 검사 뒤 저장.
 * 원격본은 contentVersion 이 번들보다 낮지 않을 때만 써요. 실패(아직 Pages 없음 404 포함)하면 조용히 지금 것 그대로.
 */

export type StaticName = 'symbols' | 'universe' | 'content';
export const STATIC_CACHE_PREFIX = 'palsal.static.v1:';
const TIMEOUT_MS = 8000;

export interface LiveStatic {
  symbols: SymbolsFile;
  universe: UniverseFile;
  content: ContentFile;
  /** 원격본을 쓰고 있는 파일 */
  remote: StaticName[];
}

export const liveStatic = createStore<LiveStatic>({ symbols: bundledSymbols, universe: bundledUniverse, content: bundledContent, remote: [] });

interface Cache<T> {
  version: 1;
  fetchedOn: string;
  etag: string | null;
  data: T;
}

type FileOf<N extends StaticName> = N extends 'symbols' ? SymbolsFile : N extends 'universe' ? UniverseFile : ContentFile;

const BUNDLED = { symbols: bundledSymbols, universe: bundledUniverse, content: bundledContent } as const;

function usable<N extends StaticName>(name: N, v: unknown, appVersion: string): v is FileOf<N> {
  if (name === 'symbols') return isSymbolsFile(v, appVersion);
  if (name === 'universe') return isUniverseFile(v);
  return isContentFile(v, appVersion);
}

/** 번들보다 낮지 않은 원격본이면 바꿔 끼워요 */
function apply<N extends StaticName>(name: N, data: FileOf<N>): boolean {
  if (compareContentVersion(data.contentVersion, BUNDLED[name].contentVersion) < 0) return false;
  liveStatic.update((s) => ({ ...s, [name]: data, remote: s.remote.includes(name) ? s.remote : [...s.remote, name] }));
  if (name === 'symbols') refillSymbolIndex(data as SymbolsFile);
  return true;
}

export type FetchResult<T> = { status: 'ok'; data: T; etag: string | null } | { status: 'notModified' } | { status: 'failed'; code: string };

/** GitHub Pages 에서 한 파일(ETag 로 바뀐 것만) */
export async function fetchStatic<N extends StaticName>(name: N, etag: string | null, appVersion: string): Promise<FetchResult<FileOf<N>>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${STATIC_BASE_URL}/${name}.json`, { signal: ctrl.signal, headers: etag ? { 'If-None-Match': etag } : {}, cache: 'no-cache' });
    if (res.status === 304) return { status: 'notModified' };
    if (!res.ok) return { status: 'failed', code: String(res.status) };
    const json: unknown = await res.json();
    if (!usable(name, json, appVersion)) return { status: 'failed', code: 'shape' };
    return { status: 'ok', data: json, etag: res.headers.get('ETag') };
  } catch {
    return { status: 'failed', code: ctrl.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

async function refreshOne<N extends StaticName>(name: N, today: string, appVersion: string, onError?: (name: N, code: string) => void): Promise<void> {
  const raw = (await readJson(STATIC_CACHE_PREFIX + name)) as Cache<unknown> | null;
  const cache = raw && raw.version === 1 && typeof raw.fetchedOn === 'string' && usable(name, raw.data, appVersion) ? (raw as Cache<FileOf<N>>) : null;
  if (cache) apply(name, cache.data);
  if (cache?.fetchedOn === today) return;
  const result = await fetchStatic(name, cache?.etag ?? null, appVersion);
  if (result.status === 'ok') {
    apply(name, result.data);
    await writeJson(STATIC_CACHE_PREFIX + name, { version: 1, fetchedOn: today, etag: result.etag, data: result.data } satisfies Cache<FileOf<N>>);
  } else if (result.status === 'notModified') {
    if (cache) await writeJson(STATIC_CACHE_PREFIX + name, { ...cache, fetchedOn: today });
  } else onError?.(name, result.code);
}

/** 앱을 열 때 한 번(세 파일 함께). 하루 한 번만 실제로 물어요 */
export async function loadStatic(today: string, appVersion: string = __APP_VERSION__, onError?: (name: StaticName, code: string) => void): Promise<void> {
  await Promise.all((['symbols', 'universe', 'content'] as const).map((n) => refreshOne(n, today, appVersion, onError)));
}

/** 테스트용 */
export function resetLiveStatic(): void {
  liveStatic.set({ symbols: bundledSymbols, universe: bundledUniverse, content: bundledContent, remote: [] });
  refillSymbolIndex(bundledSymbols);
}

export function useLiveStatic(): LiveStatic {
  return useStore(liveStatic);
}
