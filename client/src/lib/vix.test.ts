import { describe, expect, it } from 'vitest';

import { VIX_LABEL, vixZone } from './vix';

describe('VIX 구간', () => {
  it('12 · 20 · 30 · 40 이 경계(그 값부터 다음 구간)', () => {
    expect([9.5, 11.99, 12, 19.99, 20, 29.99, 30, 39.99, 40, 82.69].map((v) => VIX_LABEL[vixZone(v)])).toEqual([
      '아주 평온',
      '아주 평온',
      '평온',
      '평온',
      '불안',
      '불안',
      '공포',
      '공포',
      '극단적 공포',
      '극단적 공포',
    ]);
  });
});
