import { describe, expect, it } from 'vitest';

import { atLatest, clampView, drawRange, fitRange, indexAt, initialView, MIN_VISIBLE, panView, pinchView, timeTicks, viewStart, zoomView } from './chartView';
import { formatBarPeriod } from './format';

const N = 530;
const W = 330;

/** 화면 자리(0~1)에 있는 봉 번호(소수) */
const barAt = (v: { end: number; count: number }, frac: number) => viewStart(v) + frac * (v.count - 1);

describe('보이는 구간', () => {
  it('처음엔 자세히 차트와 같은 최근 구간', () => {
    expect(initialView(N, 180)).toEqual({ end: N - 1, count: 180 });
    expect(initialView(10, 180)).toEqual({ end: 9, count: 10 });
    expect(atLatest(initialView(N, 180), N)).toBe(true);
  });

  it('봉 수는 20~전체, 끝은 첫 봉과 최신 봉 사이로 잘라요', () => {
    expect(clampView({ end: N - 1, count: 3 }, N).count).toBe(MIN_VISIBLE);
    expect(clampView({ end: N - 1, count: 9999 }, N)).toEqual({ end: N - 1, count: N });
    expect(clampView({ end: 5, count: 100 }, N)).toEqual({ end: 99, count: 100 });
    expect(clampView({ end: N + 50, count: 100 }, N).end).toBe(N - 1);
  });

  it('오른쪽으로 밀면 지난 봉, 첫 봉에서 멈춰요', () => {
    const v = initialView(N, 180);
    const moved = panView(v, W / 2, W, N); // 그래프 반 폭 = 약 90봉
    expect(moved.end).toBeCloseTo(N - 1 - 179 / 2, 6);
    expect(moved.count).toBe(180);
    expect(atLatest(moved, N)).toBe(false);
    expect(panView(v, W * 100, W, N).end).toBe(179);
    expect(panView(v, -W, W, N).end).toBe(N - 1);
  });

  it('확대·축소는 잡은 자리의 봉을 그 자리에 둬요', () => {
    const v = { end: 300, count: 180 };
    const zin = zoomView(v, 2, 0.5, N);
    expect(zin.count).toBe(90);
    expect(barAt(zin, 0.5)).toBeCloseTo(barAt(v, 0.5), 6);
    const zout = zoomView(v, 0.5, 0.25, N);
    expect(zout.count).toBe(360);
    expect(barAt(zout, 0.25)).toBeCloseTo(barAt(v, 0.25), 6);
    // 최신에 붙어 있으면 오른쪽 끝(1)을 잡아 최신이 그대로 보여요
    expect(atLatest(zoomView(initialView(N, 180), 1.5, 1, N), N)).toBe(true);
  });

  it('두 손가락: 처음 가운데 있던 봉이 지금 가운데로, 벌린 만큼 크게', () => {
    const v = { end: 400, count: 180 };
    const p = pinchView(v, 0.4, 0.6, 3, N);
    expect(p.count).toBeCloseTo(60, 6);
    expect(barAt(p, 0.6)).toBeCloseTo(barAt(v, 0.4), 6);
    expect(pinchView(v, 0.5, 0.5, 0.01, N).count).toBe(N);
    expect(pinchView(v, 0.5, 0.5, 100, N).count).toBe(MIN_VISIBLE);
  });

  it('누른 자리에 가장 가까운 봉 · 그릴 범위 · 세로 범위', () => {
    const v = { end: 299.4, count: 101 };
    expect(indexAt(v, 0, N)).toBe(199);
    expect(indexAt(v, 1, N)).toBe(299);
    expect(indexAt(v, 2, N)).toBe(299);
    expect(drawRange(v, N)).toEqual([198, 301]);
    expect(fitRange(v, N)).toEqual([200, 299]);
  });
});

const DAY = 86_400;
/** 2024-01-01(월)부터 평일만 */
function weekdays(count: number): number[] {
  const out: number[] = [];
  for (let t = Date.parse('2024-01-01T00:00:00Z') / 1000; out.length < count; t += DAY) {
    const w = new Date(t * 1000).getUTCDay();
    if (w !== 0 && w !== 6) out.push(t);
  }
  return out;
}

describe('날짜 눈금', () => {
  it('일봉을 크게 보면 주 단위 11/3 꼴', () => {
    const t = weekdays(N);
    const ticks = timeTicks(t, 'Asia/Seoul', '1d', { end: N - 1, count: 20 }, W);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const tk of ticks) expect(tk.text).toMatch(/^\d{1,2}\/\d{1,2}$/);
  });

  it('일봉 180개는 자세히 차트처럼 짝수 달 + 1월은 해', () => {
    const t = weekdays(N);
    const ticks = timeTicks(t, 'Asia/Seoul', '1d', { end: N - 1, count: 180 }, W);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const tk of ticks) expect(tk.text).toMatch(/^(([2468]|1[02])월|\d{2}년)$/);
  });

  it('일봉 전부(530개)는 6달 간격', () => {
    const t = weekdays(N);
    const ticks = timeTicks(t, 'Asia/Seoul', '1d', { end: N - 1, count: N }, W);
    for (const tk of ticks) expect(tk.text).toMatch(/^(7월|\d{2}년)$/);
  });

  it('주봉 180개 · 월봉 60개는 해', () => {
    const mondays = Array.from({ length: 260 }, (_, i) => Date.parse('2021-11-01T00:00:00Z') / 1000 + i * 7 * DAY);
    for (const tk of timeTicks(mondays, 'UTC', '1wk', { end: 259, count: 180 }, W)) expect(tk.text).toMatch(/^\d{4}년$/);
    const months = Array.from({ length: 60 }, (_, i) => Date.UTC(2021, 11 + i, 1) / 1000);
    const yearly = timeTicks(months, 'UTC', '1mo', { end: 59, count: 60 }, W);
    expect(yearly.map((tk) => tk.text)).toEqual(['2022년', '2023년', '2024년', '2025년', '2026년']);
  });
});

describe('머리의 봉 이름', () => {
  const now = new Date('2026-11-06T03:00:00Z');
  it('일봉 날짜 · 주봉 그 주 · 월봉 달', () => {
    expect(formatBarPeriod(Date.parse('2026-11-06T00:00:00Z') / 1000, 'Asia/Seoul', '1d', now)).toBe('11월 6일');
    expect(formatBarPeriod(Date.parse('2026-11-03T00:00:00Z') / 1000, 'Asia/Seoul', '1wk', now)).toBe('11월 3일 주');
    expect(formatBarPeriod(Date.parse('2025-03-03T00:00:00Z') / 1000, 'Asia/Seoul', '1mo', now)).toBe('2025년 3월');
  });
});
