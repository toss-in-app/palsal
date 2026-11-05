import type { Market, SymbolEntry, UniverseFile } from '../content';

/*
 * 종목 찾기 — 이름 · 별칭 · 영문 이름 · 티커(·종목 코드) · 초성(ㅅㅅㅈㅈ → 삼성전자).
 * 점수가 낮을수록 위: 티커·코드가 같음 → 이름이 그걸로 시작 → 별칭 시작 → 초성 시작 → 이름에 들어 있음 → 나머지.
 * 같은 점수면 시가총액 순위(universe) → 이름 순.
 */

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export function chosung(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out += code >= 0xac00 && code <= 0xd7a3 ? CHO[Math.floor((code - 0xac00) / 588)] : ch;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const isChosungOnly = (q: string) => /^[ㄱ-ㅎ]+$/.test(q);

/** 티커에서 꼬리를 뗀 코드(005930.KS → 005930, BTC-USD → btc, USDKRW=X → usdkrw) */
function codeOf(symbol: string): string {
  return norm(symbol.replace(/^\^/, '').replace(/\.(KS|KQ)$/, '').replace(/-USD$/, '').replace(/=X$/, ''));
}

export function scoreOf(entry: SymbolEntry, rawQuery: string): number | null {
  const q = norm(rawQuery);
  if (!q) return 0;
  const name = norm(entry.n);
  const aliases = (entry.a ?? []).map(norm);
  if (isChosungOnly(q)) {
    const c = chosung(name);
    if (c.startsWith(q)) return 3;
    if (aliases.some((a) => chosung(a).startsWith(q))) return 3;
    if (c.includes(q)) return 5;
    return null;
  }
  if (norm(entry.s) === q || codeOf(entry.s) === q) return 0;
  if (name.startsWith(q)) return 1;
  if (aliases.some((a) => a.startsWith(q))) return 2;
  if (codeOf(entry.s).startsWith(q)) return 2;
  if (name.includes(q) || aliases.some((a) => a.includes(q))) return 4;
  if (entry.e && norm(entry.e).includes(q)) return 5;
  return null;
}

export function rankIndex(universe: UniverseFile): Map<string, number> {
  const m = new Map<string, number>();
  universe.kr.forEach((s, i) => m.set(s, i));
  universe.us.forEach((s, i) => m.set(s, i));
  return m;
}

export function searchSymbols(items: SymbolEntry[], query: string, market: Market, rank: Map<string, number>, limit = 50): SymbolEntry[] {
  const scored: { e: SymbolEntry; s: number }[] = [];
  for (const e of items) {
    if (e.m !== market) continue;
    const s = scoreOf(e, query);
    if (s !== null) scored.push({ e, s });
  }
  scored.sort((a, b) => a.s - b.s || (rank.get(a.e.s) ?? 1e9) - (rank.get(b.e.s) ?? 1e9) || a.e.n.localeCompare(b.e.n, 'ko'));
  return scored.slice(0, limit).map((x) => x.e);
}
