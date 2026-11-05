import { describe, expect, it } from 'vitest';

import { bundledSymbols, bundledUniverse } from '../content';
import { chosung, rankIndex, searchSymbols } from './search';

const rank = rankIndex(bundledUniverse);
const find = (q: string, m: 'KR' | 'US' | 'CRYPTO' | 'FX') => searchSymbols(bundledSymbols.items, q, m, rank).map((e) => e.s);

describe('search', () => {
  it('초성', () => {
    expect(chosung('삼성전자')).toBe('ㅅㅅㅈㅈ');
    expect(chosung('SK하이닉스')).toBe('SKㅎㅇㄴㅅ');
    expect(find('ㅅㅅㅈㅈ', 'KR')[0]).toBe('005930.KS');
    expect(find('ㅋㅋㅇ', 'KR')).toContain('035720.KS');
  });

  it('종목 코드 · 별칭 · 이름 앞부분', () => {
    expect(find('005930', 'KR')[0]).toBe('005930.KS');
    expect(find('삼전', 'KR')[0]).toBe('005930.KS');
    expect(find('하이닉스', 'KR')[0]).toBe('000660.KS');
  });

  it('미국은 티커·한글 이름·영문 이름', () => {
    expect(find('nvda', 'US')[0]).toBe('NVDA');
    expect(find('엔비', 'US')[0]).toBe('NVDA');
    expect(find('tesla', 'US')).toContain('TSLA');
  });

  it('코인은 기호, 분류가 다르면 안 나와요', () => {
    expect(find('btc', 'CRYPTO')[0]).toBe('BTC-USD');
    expect(find('btc', 'US')).toEqual([]);
  });

  it('빈 검색어면 분류 전체를 시가총액 순으로', () => {
    const kr = find('', 'KR');
    expect(kr[0]).toBe(bundledUniverse.kr[0]);
    expect(kr.length).toBeGreaterThan(5);
  });
});
