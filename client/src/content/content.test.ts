import { describe, expect, it } from 'vitest';

import { SYMBOL } from '../lib/router';
import { activeNotice, bundledContent, bundledSymbols, bundledUniverse, symbolIndex } from './index';

describe('번들 콘텐츠', () => {
  it('세 파일이 제 종류예요', () => {
    expect(bundledSymbols.kind).toBe('symbols');
    expect(bundledUniverse.kind).toBe('universe');
    expect(bundledContent.kind).toBe('content');
  });

  it('종목 목록 심볼은 계약 꼴이고 겹치지 않아요', () => {
    const seen = new Set<string>();
    for (const it of bundledSymbols.items) {
      expect(it.s).toMatch(SYMBOL);
      expect(seen.has(it.s)).toBe(false);
      seen.add(it.s);
    }
  });

  it('시총 상위 목록은 모두 종목 목록에 있어요', () => {
    for (const s of [...bundledUniverse.kr, ...bundledUniverse.us]) expect(symbolIndex.has(s)).toBe(true);
    expect(bundledUniverse.kr.length).toBeGreaterThanOrEqual(15);
    expect(bundledUniverse.us.length).toBeGreaterThanOrEqual(15);
  });

  it('RSI 구간 설명은 아주 낮음·낮음·보통·높음 순서', () => {
    expect(bundledContent.zones.map((z) => z.name)).toEqual(['아주 낮음', '낮음', '보통', '높음']);
  });

  it('용어 시트의 같이 보면 좋은 말은 있는 말만', () => {
    const keys = new Set(Object.keys(bundledContent.glossary));
    for (const g of Object.values(bundledContent.glossary)) for (const r of g.related) expect(keys.has(r)).toBe(true);
  });

  it('행동 지시 문구가 없어요(출시 불가 6번)', () => {
    const all = JSON.stringify(bundledContent).replace(/과매도|과매수/g, '');
    for (const bad of ['매수', '매도', '사세요', '파세요', '반등 가능성']) expect(all).not.toContain(bad);
  });

  it('공지는 until 까지만', () => {
    const withNotice = { ...bundledContent, notice: { text: '점검 안내', until: '2026-11-10' } };
    expect(activeNotice(withNotice, '2026-11-10')).toBe('점검 안내');
    expect(activeNotice(withNotice, '2026-11-11')).toBeNull();
    expect(activeNotice({ ...bundledContent, notice: null }, '2026-11-10')).toBeNull();
  });
});
