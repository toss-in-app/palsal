import { describe, expect, it } from 'vitest';

import { eventTerm, eventTitle, EVENTS_MAX, stockEvents } from './events';
import { analyze, type Bars } from './series';

const DAY0 = Date.parse('2025-01-02T00:00:00Z') / 1000;

function barsOf(closes: number[], high5y = Math.max(...closes)): Bars {
  return { interval: '1d', tz: 'UTC', t: closes.map((_, i) => DAY0 + i * 86400), c: closes, l: closes.map((v) => v * 0.995), high5y };
}

/** 오래 오르다(70 위) 꺾여 오래 내리는(30 아래) 종가 */
function upThenDown(): number[] {
  const out = [100];
  for (let i = 0; i < 200; i++) out.push(out[i] * (1 + 0.004 + 0.01 * Math.sin(i / 2)));
  for (let i = 0; i < 160; i++) out.push(out[out.length - 1] * (1 - 0.006 + 0.01 * Math.sin(i / 2)));
  return out;
}

describe('stockEvents', () => {
  it('화면 기간 안의 30 아래·70 위 진입과 교차를 새 것부터', () => {
    const b = barsOf(upThenDown());
    const a = analyze(b, false)!;
    const ev = stockEvents(b, a);
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.length).toBeLessThanOrEqual(EVENTS_MAX);
    for (let i = 1; i < ev.length; i++) expect(ev[i - 1].t).toBeGreaterThanOrEqual(ev[i].t);
    expect(ev.every((e) => e.t >= a.chart.t[0])).toBe(true);
    expect(ev.some((e) => e.kind === 'rsi_low_enter')).toBe(true);
    expect(ev.some((e) => e.kind === 'ma_cross_down')).toBe(true);
    const low = ev.find((e) => e.kind === 'rsi_low_enter')!;
    expect(low.from).toBeGreaterThan(30);
    expect(low.to).toBeLessThanOrEqual(30);
  });

  it('5년 최고가를 새로 쓰면 맨 위에', () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 + i);
    const b = barsOf(closes, 150);
    const ev = stockEvents(b, analyze(b, false)!);
    expect(ev[0]).toMatchObject({ kind: 'high5y', t: b.t[199] });
  });

  it('제목과 누르면 여는 말', () => {
    expect(eventTitle({ kind: 'ma_cross_up', t: 0 }, '1wk')).toBe('60주선이 120주선을 위로 넘었어요');
    expect(eventTitle({ kind: 'rsi_high_enter', t: 0 }, '1d')).toBe('RSI가 70을 넘었어요');
    expect(eventTerm('div_bear')).toBe('divergence');
    expect(eventTerm('rsi_low_enter')).toBe('zone-low');
  });
});

describe('recentChanges', () => {
  it('엇갈림은 빼고 since 이후만', async () => {
    const { recentChanges } = await import('./events');
    const b = barsOf(upThenDown());
    const a = analyze(b, false)!;
    const all = stockEvents(b, a);
    const since = all[Math.floor(all.length / 2)].t;
    const recent = recentChanges(b, a, since);
    expect(recent.every((e) => e.t >= since && (e.kind as string) !== 'div_bull' && (e.kind as string) !== 'div_bear')).toBe(true);
  });

  it('5년 최고가는 그 값에 닿은 가장 최근 봉', () => {
    const closes = Array.from({ length: 200 }, (_, i) => (i === 190 ? 300 : 100 + (i % 7)));
    const b = barsOf(closes, 300);
    const high = stockEvents(b, analyze(b, false)!).find((e) => e.kind === 'high5y');
    expect(high).toMatchObject({ t: b.t[190], to: 300 });
  });
});
