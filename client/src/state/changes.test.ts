import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readJson } from '../lib/storage';
import { analyze, type Bars } from '../lib/series';
import { CHANGES_KEY, changesStore, dropChanges, loadChanges, onLiveChanges, recordChanges, relativeDay, resetChanges, tidy, type ChangeItem } from './changes';
import { watchStore } from './watch';

const NOW = Date.parse('2026-11-05T06:00:00Z'); // 15:00 KST
const DAY = 86_400;

/** 오르내림이 같은 지그재그(RSI 약 50) — crash 면 마지막 봉에서 15 떨어져 RSI 약 23 */
function zigzag(crash: boolean): Bars {
  const end = Math.floor(Date.parse('2026-11-05T00:00:00Z') / 1000);
  const c = Array.from({ length: 200 }, (_, i) => 100 + (i % 2 ? -0.5 : 0.5));
  if (crash) c[199] = c[198] - 15;
  return { interval: '1d', tz: 'UTC', t: c.map((_, i) => end - (199 - i) * DAY), c, l: c.map((v) => v - 0.1), high5y: 500 };
}

const item = (watchId: string, date: string, kind: ChangeItem['kind'] = 'ma_cross_up', at = 1): ChangeItem => ({ kind, watchId, date, at, from: null, to: null });

beforeEach(() => {
  resetChanges();
  watchStore.set({ ready: true, items: [{ id: 'X|1d', symbol: 'X', interval: '1d', addedAt: 0 }] });
});

describe('tidy', () => {
  it('7일 지난 것 · 담지 않은 종목 · 중복을 빼고 새 것부터', () => {
    const out = tidy(
      [item('X|1d', '2026-10-20'), item('X|1d', '2026-11-04'), item('X|1d', '2026-11-04'), item('Y|1d', '2026-11-05'), item('X|1d', '2026-11-05', 'high5y')],
      new Set(['X|1d']),
      NOW,
    );
    expect(out.map((c) => `${c.kind}@${c.date}`)).toEqual(['high5y@2026-11-05', 'ma_cross_up@2026-11-04']);
  });
});

describe('recordChanges', () => {
  it('처음 계산한 종목은 조용히 기록, 그 뒤에 새로 생긴 RSI 진입만 토스트', async () => {
    const live = vi.fn();
    const off = onLiveChanges(live);
    const calm = zigzag(false);
    const crash = zigzag(true);
    const a0 = analyze(calm, false)!;
    const a1 = analyze(crash, false)!;
    expect(a0.rsi!).toBeGreaterThan(30);
    expect(a1.rsi!).toBeLessThanOrEqual(30);

    // 처음 계산: 진입 없음
    expect(recordChanges([{ id: 'X|1d', bars: calm, analysis: a0 }], NOW).some((c) => c.kind === 'rsi_low_enter')).toBe(false);
    // 보는 중에 마지막 봉이 30 아래로 → 기록 + 토스트
    // (같은 봉에서 60일선도 120일선 아래로 내려가 교차도 함께 기록돼요 — 토스트는 RSI 진입만)
    const fresh = recordChanges([{ id: 'X|1d', bars: crash, analysis: a1 }], NOW);
    const entry = expect.objectContaining({ kind: 'rsi_low_enter', watchId: 'X|1d', date: '2026-11-05', to: a1.rsi });
    expect(fresh).toEqual(expect.arrayContaining([entry]));
    expect(live).toHaveBeenCalledWith([entry]);
    // 같은 날 다시 계산해도 두 번 쌓이지 않아요
    expect(recordChanges([{ id: 'X|1d', bars: crash, analysis: a1 }], NOW)).toEqual([]);
    off();

    await new Promise((r) => setTimeout(r, 0));
    const saved = (await readJson(CHANGES_KEY)) as { version: number; items: ChangeItem[] };
    expect(saved).toEqual({ version: 1, items: changesStore.get() });
  });

  it('처음 계산한 종목의 진입은 조용히(열 때는 요약 토스트가 따로)', () => {
    const live = vi.fn();
    const off = onLiveChanges(live);
    const crash = zigzag(true);
    expect(recordChanges([{ id: 'X|1d', bars: crash, analysis: analyze(crash, false)! }], NOW).some((c) => c.kind === 'rsi_low_enter')).toBe(true);
    expect(live).not.toHaveBeenCalled();
    off();
  });

  it('담지 않은 종목은 기록하지 않아요', () => {
    const b = zigzag(true);
    expect(recordChanges([{ id: 'Z|1d', bars: b, analysis: analyze(b, false)! }], NOW)).toEqual([]);
  });

  it('빼면 그 종목 기록도 빠지고, 다시 읽어도 같아요', async () => {
    changesStore.set([item('X|1d', '2026-11-05')]);
    dropChanges('X|1d');
    expect(changesStore.get()).toEqual([]);
    await new Promise((r) => setTimeout(r, 0));
    await loadChanges();
    expect(changesStore.get()).toEqual([]);
  });
});

describe('relativeDay', () => {
  it('오늘 · 어제 · 날짜', () => {
    expect(relativeDay('2026-11-05', NOW)).toBe('오늘');
    expect(relativeDay('2026-11-04', NOW)).toBe('어제');
    expect(relativeDay('2026-10-28', NOW)).toBe('10월 28일');
  });
});
