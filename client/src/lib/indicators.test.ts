import { describe, expect, it } from 'vitest';

import { displayLength, divergence, fromHigh, lastRsi, lowMarks, maCross, peakMarks, rsiLowSeries, rsiSeries, sma, zoneOf } from './indicators';

/**
 * Wilder RSI 를 설명할 때 흔히 쓰는 예제 종가 33개.
 * 교과서 표(첫 값 70.53)는 중간 평균을 반올림해 계산해서 조금 달라요. 아래는 반올림 없이 따로(파이썬) 계산한 값이에요.
 */
const WILDER = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18,
  44.22, 44.57, 43.42, 42.66, 43.13,
];
const WILDER_RSI = [70.46, 66.25, 66.48, 69.35, 66.29, 57.92, 62.88, 63.21, 56.01, 62.34, 54.67, 50.39, 40.02, 41.49, 41.9, 45.5, 37.32, 33.09, 37.79];

/** 날마다 rate 만큼 오르내리는 종가 */
function walk(start: number, steps: number[]): number[] {
  const out = [start];
  for (const s of steps) out.push(out[out.length - 1] * (1 + s));
  return out;
}

describe('rsiSeries', () => {
  it('Wilder 예제와 같은 값', () => {
    const r = rsiSeries(WILDER);
    expect(r.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(r.slice(14)).toEqual(WILDER_RSI);
    expect(lastRsi(WILDER)).toBe(37.79);
  });

  it('봉이 15개보다 적으면 값이 없어요', () => {
    expect(lastRsi(WILDER.slice(0, 14))).toBeNull();
    expect(lastRsi(WILDER.slice(0, 15))).toBe(70.46);
  });

  it('내린 날이 없으면 100', () => {
    expect(lastRsi(walk(10, new Array(20).fill(0.01)))).toBe(100);
  });
});

describe('rsiLowSeries', () => {
  it('저가가 종가보다 낮을 때만 RSI가 더 낮아져요', () => {
    const lows = WILDER.map((c, i) => (i === 20 ? c - 1 : c));
    const low = rsiLowSeries(WILDER, lows);
    const close = rsiSeries(WILDER);
    expect(low[14]).toBeNull();
    expect(low[19]).toBeCloseTo(close[19]!, 6);
    expect(low[20]!).toBeLessThan(close[20]!);
    expect(low[21]).toBeCloseTo(close[21]!, 6);
  });
});

describe('zoneOf', () => {
  it('구간 경계', () => {
    expect([19.99, 20, 30, 30.01, 69.99, 70].map(zoneOf)).toEqual(['vlow', 'low', 'low', 'mid', 'mid', 'high']);
  });
});

describe('sma · maCross', () => {
  it('이동평균', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  it('최근 10봉 안에서 60선이 120선을 넘은 날', () => {
    // 내리다가 오르면 60선이 120선을 아래에서 위로 넘어요
    const c = walk(100, [...new Array(130).fill(-0.004), ...new Array(70).fill(0.012)]);
    const m60 = sma(c, 60);
    const m120 = sma(c, 120);
    const crossAt = c.findIndex((_, i) => i > 120 && m60[i - 1]! <= m120[i - 1]! && m60[i]! > m120[i]!);
    expect(crossAt).toBeGreaterThan(0);
    expect(maCross(c.slice(0, crossAt + 5))).toEqual({ type: 'up', index: crossAt });
    expect(maCross(c.slice(0, crossAt + 15))).toBeNull();
    expect(maCross(c.slice(0, 120))).toBeNull();
  });
});

describe('divergence', () => {
  it('가격은 더 낮은 저점, RSI는 더 높은 저점 → bull', () => {
    // 크게 빠진 첫 저점 → 반등 → 천천히 조금 더 낮은 둘째 저점(최근 20봉 안) → 반등
    const steps = [
      ...new Array(40).fill(0.002),
      ...new Array(8).fill(-0.03),
      ...new Array(12).fill(0.012),
      ...new Array(14).fill(-0.012),
      -0.004,
      ...new Array(6).fill(0.01),
    ];
    const c = walk(100, steps);
    const d = divergence(c);
    expect(d?.type).toBe('bull');
    expect(c[d!.to]).toBeLessThan(c[d!.from]);
    expect(d!.rsiTo).toBeGreaterThan(d!.rsiFrom);
    expect(d!.to).toBeGreaterThanOrEqual(c.length - 20);
  });

  it('30봉보다 짧거나 엇갈림이 없으면 null', () => {
    expect(divergence(walk(100, new Array(20).fill(0.01)))).toBeNull();
    expect(divergence(walk(100, new Array(100).fill(0.003)))).toBeNull();
  });
});

describe('lowMarks', () => {
  it('종가로 30 아래면 ▲, 장중에만이면 △, 구간마다 저가가 가장 낮은 봉 하나', () => {
    const n = 40;
    const rsi: (number | null)[] = new Array(n).fill(50);
    const rsiLow: (number | null)[] = new Array(n).fill(50);
    const lows = new Array(n).fill(100);
    rsi[20] = 29;
    rsi[21] = 25;
    rsi[22] = 31;
    rsiLow[22] = 28;
    lows[21] = 90;
    lows[22] = 88;
    rsiLow[30] = 29;
    lows[30] = 95;
    expect(lowMarks(lows, rsi, rsiLow)).toEqual([
      { index: 22, closed: true },
      { index: 30, closed: false },
    ]);
  });
});

describe('peakMarks', () => {
  it('충분히 오른 뒤 가격은 더 높은데 RSI는 8 넘게 낮아진 고점 → div', () => {
    // 급하게 올라 첫 고점(RSI 높음) → 눌림 → 천천히 조금 더 높은 고점(RSI 낮음)
    const steps = [...new Array(60).fill(0), ...new Array(14).fill(0.02), ...new Array(10).fill(-0.01), ...new Array(20).fill(0.0062), ...new Array(20).fill(-0.01)];
    const c = walk(100, steps);
    const rsi = rsiSeries(c);
    const marks = peakMarks(c, rsi);
    expect(marks.length).toBeGreaterThan(0);
    const last = marks[marks.length - 1];
    expect(last.kind).toBe('div');
    expect(c[last.index]).toBeGreaterThan(c[74] * 1.002);
  });

  it('40봉보다 짧으면 없음', () => {
    expect(peakMarks(walk(100, new Array(30).fill(0.01)), [])).toEqual([]);
  });
});

describe('displayLength · fromHigh', () => {
  it('기본 180, 엇갈림 앞 지점이 밖이면 넓혀요', () => {
    expect(displayLength(300, null)).toBe(180);
    expect(displayLength(100, null)).toBe(100);
    expect(displayLength(300, { type: 'bull', from: 100, to: 290, rsiFrom: 20, rsiTo: 25 })).toBe(204);
  });

  it('5년 최고가 대비', () => {
    expect(fromHigh(41250, 152200)).toBeCloseTo(-72.9, 1);
    expect(fromHigh(100, 100)).toBe(0);
  });
});
