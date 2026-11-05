import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { asMarketPayload } from '../data/types';
import { fixtureSource } from '../data/fixture';
import { lastRsi } from './indicators';
import { fearGreedLabel, fearGreedScore } from './market';

describe('fearGreedScore', () => {
  it('RSI × 0.6 + 120일선 위치 × 0.4(위치 = 50 + 거리% × 2.5, 0~100)', () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 + i * 0.1 + Math.sin(i) * 2);
    const n = closes.length;
    const ma = closes.slice(-120).reduce((s, v) => s + v, 0) / 120;
    const position = Math.max(0, Math.min(100, 50 + ((closes[n - 1] - ma) / ma) * 100 * 2.5));
    expect(fearGreedScore(closes)).toBe(Math.round(lastRsi(closes)! * 0.6 + position * 0.4));
  });

  it('봉이 120개보다 적으면 위치 점수 50, 20개보다 적으면 null', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 1 : -1));
    expect(fearGreedScore(closes)).toBe(Math.round(lastRsi(closes)! * 0.6 + 50 * 0.4));
    expect(fearGreedScore(closes.slice(0, 19))).toBeNull();
  });

  it('구간 이름', () => {
    expect([24, 25, 44, 45, 55, 56, 75, 76].map(fearGreedLabel)).toEqual(['극단적 공포', '공포', '공포', '중립', '중립', '탐욕', '탐욕', '극단적 탐욕']);
  });
});

describe('asMarketPayload', () => {
  it('계약 예시와 개발용 예시 데이터를 받아요', async () => {
    const sample = JSON.parse(readFileSync(`${process.cwd()}/../contract/samples/market.sample.json`, 'utf8'));
    expect(asMarketPayload(sample)).not.toBeNull();
    const fx = await fixtureSource(() => Date.parse('2026-11-05T06:40:00Z'), 0).market();
    expect(asMarketPayload(fx)).not.toBeNull();
    expect(fx!.fearGreed.crypto.attribution).toBe('출처 alternative.me');
  });

  it('모양이 다르면 null', () => {
    expect(asMarketPayload(null)).toBeNull();
    expect(asMarketPayload({ schema: 2 })).toBeNull();
  });
});
