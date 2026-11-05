import { describe, expect, it } from 'vitest';

import { lastRsi } from './indicators';
import { analyze, exchangeDay, MAX_BARS, withQuote, type Bars, type QuoteLike } from './series';

const sec = (iso: string) => Date.parse(iso) / 1000;

function kr(): Bars {
  return { interval: '1d', tz: 'Asia/Seoul', t: [sec('2026-11-03T00:00:00Z'), sec('2026-11-04T00:00:00Z')], c: [100, 101], l: [99, 100], high5y: 150 };
}

const q = (price: number, iso: string, marketState: QuoteLike['marketState'] = 'REGULAR'): QuoteLike => ({ price, marketState, fetchedAt: Date.parse(iso) });

describe('exchangeDay', () => {
  it('거래소 현지 날짜', () => {
    const t = Date.parse('2026-11-05T02:00:00Z');
    expect(exchangeDay(t, 'Asia/Seoul')).toBe('2026-11-05');
    expect(exchangeDay(t, 'America/New_York')).toBe('2026-11-04');
    expect(exchangeDay(t, 'UTC')).toBe('2026-11-05');
  });
});

describe('withQuote', () => {
  it('다음 거래일 현재가는 새 봉으로 붙여요', () => {
    const b = withQuote(kr(), q(103, '2026-11-05T02:00:00Z'));
    expect(b.c).toEqual([100, 101, 103]);
    expect(b.l).toEqual([99, 100, 103]);
    expect(b.t[2]).toBe(sec('2026-11-05T00:00:00Z'));
  });

  it('같은 날 현재가는 마지막 봉을 고쳐요(저가는 더 낮을 때만)', () => {
    expect(withQuote(kr(), q(102, '2026-11-04T05:00:00Z')).c).toEqual([100, 102]);
    const lower = withQuote(kr(), q(98, '2026-11-04T05:00:00Z'));
    expect(lower.c).toEqual([100, 98]);
    expect(lower.l).toEqual([99, 98]);
  });

  it('장 시작 전(PRE) 값은 붙이지 않아요', () => {
    const us: Bars = { ...kr(), tz: 'America/New_York', t: [sec('2026-11-03T14:30:00Z'), sec('2026-11-04T14:30:00Z')] };
    expect(withQuote(us, q(101.5, '2026-11-05T12:00:00Z', 'PRE')).c).toEqual([100, 101.5]);
  });

  it('오래된 현재가 · 같은 값 · 값 없음은 그대로', () => {
    const b = kr();
    expect(withQuote(b, q(90, '2026-11-03T05:00:00Z'))).toBe(b);
    expect(withQuote(b, q(101, '2026-11-05T05:00:00Z'))).toBe(b);
    expect(withQuote(b, null)).toBe(b);
  });

  it('주봉: 같은 주는 고치고 다음 주는 붙여요', () => {
    const w: Bars = { interval: '1wk', tz: 'America/New_York', t: [sec('2026-10-26T14:30:00Z'), sec('2026-11-02T14:30:00Z')], c: [10, 11], l: [9, 10], high5y: 20 };
    expect(withQuote(w, q(12, '2026-11-05T18:00:00Z')).c).toEqual([10, 12]);
    expect(withQuote(w, q(12, '2026-11-10T18:00:00Z')).c).toEqual([10, 11, 12]);
  });

  it('월봉: 같은 달은 고치고 다음 달은 붙여요', () => {
    const m: Bars = { interval: '1mo', tz: 'UTC', t: [sec('2026-10-01T00:00:00Z'), sec('2026-11-01T00:00:00Z')], c: [10, 11], l: [9, 10], high5y: 20 };
    expect(withQuote(m, q(12, '2026-11-20T00:00:00Z')).c).toEqual([10, 12]);
    expect(withQuote(m, q(12, '2026-12-02T00:00:00Z')).c).toEqual([10, 11, 12]);
  });

  it('최대 봉 수를 넘으면 가장 오래된 봉을 빼요', () => {
    const n = MAX_BARS;
    const day0 = Date.parse('2024-01-01T00:00:00Z') / 1000;
    const b: Bars = { interval: '1d', tz: 'UTC', t: Array.from({ length: n }, (_, i) => day0 + i * 86400), c: new Array(n).fill(5), l: new Array(n).fill(4), high5y: 9 };
    const after = withQuote(b, q(6, new Date((day0 + n * 86400) * 1000 + 3_600_000).toISOString(), '24H'));
    expect(after.c).toHaveLength(n);
    expect(after.t[0]).toBe(day0 + 86400);
    expect(after.c[n - 1]).toBe(6);
  });
});

describe('analyze', () => {
  const N = 420;
  const day0 = Date.parse('2025-01-01T00:00:00Z') / 1000;
  const closes = Array.from({ length: N }, (_, i) => 100 + 20 * Math.sin(i / 17) + i * 0.05);
  const bars: Bars = { interval: '1d', tz: 'UTC', t: closes.map((_, i) => day0 + i * 86400), c: closes, l: closes.map((v) => v * 0.99), high5y: Math.max(...closes) };

  it('머리 RSI는 받은 봉 전부로, 차트는 최근 180봉', () => {
    const a = analyze(bars, false)!;
    expect(a.rsi).toBe(Math.round(lastRsi(closes)! * 10) / 10);
    expect(a.chart.c).toHaveLength(180);
    expect(a.chart.c[179]).toBe(closes[N - 1]);
    expect(a.chart.ma200?.[179]).toBeCloseTo(closes.slice(-200).reduce((s, v) => s + v, 0) / 200, 6);
    expect(a.chart.ma50w?.[179]).toBeCloseTo(closes.slice(-250).reduce((s, v) => s + v, 0) / 250, 6);
    expect(a.fromHigh).toBeLessThanOrEqual(0);
  });

  it('코인은 50주선이 350일', () => {
    const a = analyze(bars, true)!;
    expect(a.chart.ma50w?.[179]).toBeCloseTo(closes.slice(-350).reduce((s, v) => s + v, 0) / 350, 6);
  });

  it('주봉·월봉엔 200일선·50주선이 없어요', () => {
    const a = analyze({ ...bars, interval: '1wk' }, false)!;
    expect(a.chart.ma200).toBeNull();
    expect(a.chart.ma50w).toBeNull();
    expect(a.chart.ma120.some((v) => v !== null)).toBe(true);
  });

  it('현재가가 5년 최고가보다 높으면 0(새로 씀)', () => {
    const a = analyze({ ...bars, high5y: 50 }, false)!;
    expect(a.fromHigh).toBe(0);
  });
});
