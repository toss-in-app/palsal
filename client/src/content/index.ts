/**
 * 정적 콘텐츠(계약: contract/content.schema.json v1) — 종목 목록 · 시총 상위 목록 · 도움말 글.
 * 4단계는 번들 동봉본(*.bundled.json, `npm run content` 가 만듦)으로 그리고, 원격(GitHub Pages, 하루 한 번 ETag)은 5단계에서 붙여요.
 * 화면에서 쓰는 부분만 타입을 적고 나머지는 계약 스키마가 기준이에요.
 */
import contentJson from './content.bundled.json';
import symbolsJson from './symbols.bundled.json';
import universeJson from './universe.bundled.json';

export const STATIC_BASE_URL = 'https://toss-in-app.github.io/palsal';
export const TERMS_URL = `${STATIC_BASE_URL}/terms/`;
export const PRIVACY_URL = `${STATIC_BASE_URL}/privacy/`;

export type Market = 'KR' | 'US' | 'CRYPTO' | 'FX';

export interface SymbolEntry {
  /** 심볼(예: 005930.KS) */
  s: string;
  /** 화면 이름 */
  n: string;
  /** 영문 이름 */
  e?: string;
  /** 검색 별칭 */
  a?: string[];
  m: Market;
  x?: string;
}

export interface SymbolsFile {
  kind: 'symbols';
  contentVersion: string;
  minClientVersion: string;
  items: SymbolEntry[];
}

export interface UniverseFile {
  kind: 'universe';
  contentVersion: string;
  asOfDate: string;
  kr: string[];
  us: string[];
}

export type ZoneKey = 'vlow' | 'low' | 'mid' | 'high';

export interface ContentFile {
  kind: 'content';
  contentVersion: string;
  minClientVersion: string;
  notice: { text: string; until: string } | null;
  zones: { key: ZoneKey; range: string; name: string; body: string }[];
  howToRead: { title: string; body: string }[];
  fearGreed: { title: string; body: string };
  faq: { q: string; a: string }[];
  glossary: Record<string, { title: string; body: string; caution?: string; related: string[] }>;
  sources: { what: string; name: string }[];
  disclaimer: string;
}

export const bundledSymbols = symbolsJson as SymbolsFile;
export const bundledUniverse = universeJson as UniverseFile;
export const bundledContent = contentJson as ContentFile;

const index = new Map(bundledSymbols.items.map((it) => [it.s, it]));

/** 심볼 → 종목 정보. 원격 종목 목록을 받으면 같은 Map 을 새로 채워요(화면은 liveStatic 구독으로 다시 그려요) */
export const symbolIndex: ReadonlyMap<string, SymbolEntry> = index;

export function refillSymbolIndex(file: SymbolsFile): void {
  index.clear();
  for (const it of file.items) index.set(it.s, it);
}

/** 'YYYY-MM-DD.N' 문구 버전 비교(N 이 두 자리여도 맞게) */
export function compareContentVersion(a: string, b: string): number {
  const [da, na] = a.split('.');
  const [db, nb] = b.split('.');
  return da === db ? Number(na) - Number(nb) : da < db ? -1 : 1;
}

/** 'x.y.z' 앱 버전 비교 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const VERSION = /^\d{4}-\d{2}-\d{2}\.\d+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const SYMBOL = /^\^?[A-Z0-9.=-]{1,20}$/;
const MARKETS = ['KR', 'US', 'CRYPTO', 'FX'];
const str = (v: unknown) => typeof v === 'string' && v.length > 0;

/*
 * 원격 정적 파일(GitHub Pages) 검사 — 계약 content.schema.json 의 핵심만 실행 중에 확인해요(빌드는 ajv 로 전부).
 * 화면이 쓰는 칸의 모양이 맞고, 이 앱 버전으로 읽을 수 있을 때(minClientVersion ≤ 앱 버전)만 써요.
 */
export function isSymbolsFile(v: unknown, appVersion: string): v is SymbolsFile {
  if (!isObj(v) || v.kind !== 'symbols' || !VERSION.test(String(v.contentVersion)) || !SEMVER.test(String(v.minClientVersion))) return false;
  if (compareSemver(String(v.minClientVersion), appVersion) > 0 || !Array.isArray(v.items) || !v.items.length) return false;
  return v.items.every((it) => isObj(it) && SYMBOL.test(String(it.s)) && str(it.n) && MARKETS.includes(it.m as string) && (it.a === undefined || (Array.isArray(it.a) && it.a.every(str))));
}

export function isUniverseFile(v: unknown): v is UniverseFile {
  if (!isObj(v) || v.kind !== 'universe' || !VERSION.test(String(v.contentVersion)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(v.asOfDate))) return false;
  const list = (x: unknown) => Array.isArray(x) && x.length >= 1 && x.length <= 30 && x.every((s) => SYMBOL.test(String(s)));
  return list(v.kr) && list(v.us);
}

export function isContentFile(v: unknown, appVersion: string): v is ContentFile {
  if (!isObj(v) || v.kind !== 'content' || !VERSION.test(String(v.contentVersion)) || !SEMVER.test(String(v.minClientVersion))) return false;
  if (compareSemver(String(v.minClientVersion), appVersion) > 0) return false;
  const glossaryOk = isObj(v.glossary) && Object.values(v.glossary).every((g) => isObj(g) && str(g.title) && str(g.body) && Array.isArray(g.related));
  return (
    Array.isArray(v.zones) &&
    v.zones.length === 4 &&
    Array.isArray(v.howToRead) &&
    isObj(v.fearGreed) &&
    Array.isArray(v.faq) &&
    glossaryOk &&
    Array.isArray(v.sources) &&
    str(v.disclaimer) &&
    (v.notice === null || (isObj(v.notice) && str(v.notice.text) && str(v.notice.until)))
  );
}

/** 공지는 until(한국 날짜) 까지만 보여요 */
export function activeNotice(content: ContentFile, today: string): string | null {
  return content.notice && content.notice.until >= today ? content.notice.text : null;
}
