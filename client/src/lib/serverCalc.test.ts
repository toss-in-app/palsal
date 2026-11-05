import { describe, expect, it } from 'vitest';

import * as server from '../../../supabase/functions/_shared/calc.ts';
import { marketOf } from './format';
import { lastRsi, rsiSeries } from './indicators';
import { fearGreedLabel, fearGreedScore } from './market';
import { withQuote, type Bars } from './series';

/*
 * 서버(Edge Function palsal-fetch)는 Deno 라 이 계산을 supabase/functions/_shared/calc.ts 에 옮겨 써요.
 * 시장 탭 RSI·공포탐욕이 카드와 어긋나지 않게, 같은 입력에 같은 답을 내는지 여기서 봐요(한쪽만 고치면 실패).
 */
function walk(n: number, seed: number, start = 100): number[] {
  let s = seed;
  let p = start;
  return Array.from({ length: n }, () => {
    s = (s * 16807) % 2147483647;
    p = Math.max(1, p * (1 + (s / 2147483647 - 0.5) * 0.05));
    return Math.round(p * 100) / 100;
  });
}

describe('서버 계산 = 클라 계산', () => {
  it('RSI 흐름 · 마지막 RSI', () => {
    for (const seed of [3, 7, 11, 99]) {
      const c = walk(530, seed);
      expect(server.rsiSeries(c)).toEqual(rsiSeries(c));
      expect(server.lastRsi(c)).toBe(lastRsi(c));
    }
    expect(server.lastRsi([1, 2, 3])).toBe(lastRsi([1, 2, 3]));
  });

  it('공포탐욕 점수 · 이름', () => {
    for (const seed of [5, 8, 13]) {
      for (const n of [10, 60, 300]) {
        const c = walk(n, seed);
        expect(server.fearGreedScore(c)).toBe(fearGreedScore(c));
      }
    }
    for (const score of [0, 24, 25, 44, 45, 55, 56, 75, 76, 100]) expect(server.fearGreedLabel(score)).toBe(fearGreedLabel(score));
  });

  it('현재가를 봉에 반영(같은 날 고침 · 다음 날 붙임 · 장 전 · 주봉)', () => {
    const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;
    const daily: Bars = { interval: '1d', tz: 'Asia/Seoul', t: [day('2026-11-03'), day('2026-11-04')], c: [100, 101], l: [99, 100], high5y: 120 };
    const weekly: Bars = { ...daily, interval: '1wk' };
    const cases = [
      { price: 103, marketState: 'REGULAR' as const, fetchedAt: Date.parse('2026-11-04T05:00:00Z') },
      { price: 104, marketState: 'REGULAR' as const, fetchedAt: Date.parse('2026-11-05T05:00:00Z') },
      { price: 105, marketState: 'PRE' as const, fetchedAt: Date.parse('2026-11-05T23:40:00Z') },
      { price: 101, marketState: 'CLOSED' as const, fetchedAt: Date.parse('2026-11-05T09:00:00Z') },
      { price: 99, marketState: 'REGULAR' as const, fetchedAt: Date.parse('2026-11-02T05:00:00Z') },
    ];
    for (const q of cases) {
      for (const b of [daily, weekly]) {
        const mine = withQuote(b, q);
        const theirs = server.withQuote({ interval: b.interval, tz: b.tz, t: b.t, c: b.c, l: b.l }, q);
        expect({ t: theirs.t, c: theirs.c, l: theirs.l }).toEqual({ t: mine.t, c: mine.c, l: mine.l });
      }
    }
  });

  it('심볼로 시장 가르기', () => {
    for (const s of ['005930.KS', '247540.KQ', '^KS11', '^KQ11', 'AAPL', 'BRK-B', '^GSPC', 'BTC-USD', 'USDKRW=X', 'JPYKRW=X']) {
      expect(server.marketOfSymbol(s)).toBe(marketOf(s));
    }
  });

  it('값 반올림(계약 v1.9): 원 정수 · 달러·지수·환율 소수 4자리 · 코인 유효숫자 8자리', () => {
    expect(server.roundPrice('005930.KS', 201499.99999)).toBe(201500);
    expect(server.roundPrice('^KS11', 5383.80004)).toBe(5383.8);
    expect(server.roundPrice('AAPL', 338.32000732421875)).toBe(338.32);
    expect(server.roundPrice('USDKRW=X', 1382.551234)).toBe(1382.5512);
    expect(server.roundPrice('BTC-USD', 73523.123456)).toBe(73523.123);
    expect(server.roundPrice('DOGE-USD', 0.0758612345)).toBe(0.075861234); // 이진수로 0.07586123449… 라 아래로
  });
});
