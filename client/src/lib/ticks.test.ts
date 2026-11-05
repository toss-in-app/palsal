import { describe, expect, it } from 'vitest';

import { niceTicks } from './ticks';

describe('niceTicks', () => {
  it('원화 큰 값은 둥근 10만 단위', () => {
    expect(niceTicks(150_000, 560_000)).toEqual([200_000, 300_000, 400_000, 500_000]);
  });
  it('달러는 범위에 맞춰 100 · 20 단위', () => {
    expect(niceTicks(383, 680)).toEqual([400, 500, 600]);
    expect(niceTicks(560, 640)).toEqual([580, 600, 620]);
  });
  it('소수 값도 떠다니는 오차 없이', () => {
    expect(niceTicks(0.95, 1.32)).toEqual([1, 1.1, 1.2, 1.3]);
  });
  it('위아래 끝에 바짝 붙은 눈금은 빼요', () => {
    const t = niceTicks(0, 100);
    expect(t[0]).toBeGreaterThan(5);
    expect(t[t.length - 1]).toBeLessThan(90);
  });
  it('폭이 없으면 눈금도 없어요', () => {
    expect(niceTicks(5, 5)).toEqual([]);
  });
});
