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

/** 심볼 → 종목 정보 */
export const symbolIndex: ReadonlyMap<string, SymbolEntry> = new Map(bundledSymbols.items.map((it) => [it.s, it]));

/** 공지는 until(한국 날짜) 까지만 보여요 */
export function activeNotice(content: ContentFile, today: string): string | null {
  return content.notice && content.notice.until >= today ? content.notice.text : null;
}
