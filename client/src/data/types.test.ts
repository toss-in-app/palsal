import { describe, expect, it } from 'vitest';

import sample from '../../../contract/samples/market.sample.json';
import { asMarketPayload } from './types';

describe('시장 응답 모양 검사(VIX, v1.18)', () => {
  it('계약 예시는 VIX 까지 그대로', () => {
    const p = asMarketPayload(sample);
    expect(p?.vix?.value).toBe(18.42);
    expect(p?.vix?.closes).toHaveLength(130);
  });

  it('VIX 가 없으면(예전 서버) 시장 정보는 그대로, vix 만 없음', () => {
    const rest: Record<string, unknown> = { ...sample };
    delete rest.vix;
    const p = asMarketPayload(rest);
    expect(p).not.toBeNull();
    expect(p?.vix).toBeUndefined();
  });

  it('VIX 모양이 이상하면 그 칸만 빼고 나머지는 살려요', () => {
    const p = asMarketPayload({ ...sample, vix: { value: -1, changePct: null, closes: [1] } });
    expect(p).not.toBeNull();
    expect(p?.vix).toBeUndefined();
    expect(p?.fearGreed.kr.score).toBe(sample.fearGreed.kr.score);
  });
});
