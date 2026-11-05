import { describe, expect, it } from 'vitest';

import { bundledContent, bundledSymbols, bundledUniverse } from '../content';
import { STATIC_CACHE_PREFIX } from '../content/live';
import { MAX_BARS } from '../lib/series';
import { BARS_KEY_PREFIX, CACHE_KEY } from './cards';
import { CHANGES_KEY, CHANGES_MAX } from './changes';
import { SETTINGS_KEY } from './settings';
import { WATCH_KEY, WATCH_MAX } from './watch';

/*
 * 6단계 Storage 저장량 — 담을 수 있는 만큼(100종목) 다 담고, 종목마다 봉 530개를 그날 저장했을 때의 최악.
 * 앱인토스 문서에 Storage 상한이 없어 우리 예산을 정해 지켜요(10단계 실기기에서 많이 담아 다시 확인).
 */
const BUDGET_TOTAL = 2 * 1024 * 1024;
const BUDGET_ONE_VALUE = 1024 * 1024;
// 봉 530개: 시각 10자리 + 종가·저가(코인 유효숫자 8자리가 가장 김) ≈ 16 KB. 꼬리 남은 부동소수면 25 KB 를 넘어요
const BUDGET_BARS_ITEM = 20 * 1024;

const bytes = (s: string) => new TextEncoder().encode(s).length;
type Kind = 'KRW' | 'USD' | 'CRYPTO' | 'FX';

/** 서버 반올림 규칙(contract/server.md v1.9)대로 만든 봉 저장 값 — 미국도 소수 4자리까지 쓴 비관적인 경우 */
function barsCache(kind: Kind, seed: number) {
  const round = (v: number) => (kind === 'KRW' ? Math.round(v) : kind === 'CRYPTO' ? Number(v.toPrecision(8)) : Math.round(v * 1e4) / 1e4);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let p = kind === 'KRW' ? 512_000 : kind === 'USD' ? 614.2 : kind === 'CRYPTO' ? 73_523.12 : 1_382.55;
  const t: number[] = [];
  const c: number[] = [];
  const l: number[] = [];
  for (let i = 0; i < MAX_BARS; i++) {
    p *= 1 + (rnd() - 0.5) * 0.04;
    const close = round(p);
    t.push(1_700_000_000 + i * 86_400);
    c.push(close);
    l.push(round(close * (1 - rnd() * 0.03)));
  }
  return { version: 1, day: '2026-11-05', fetchedAt: 1_762_300_000_000, t, c, l, high5y: Math.max(...c) };
}

function worstCase(): Record<string, unknown> {
  const kinds: Kind[] = [...Array<Kind>(40).fill('KRW'), ...Array<Kind>(40).fill('USD'), ...Array<Kind>(15).fill('CRYPTO'), ...Array<Kind>(5).fill('FX')];
  const items = kinds.slice(0, WATCH_MAX).map((k, i) => {
    const symbol = k === 'KRW' ? `${String(100000 + i)}.KS` : k === 'USD' ? `TICK${i}` : k === 'CRYPTO' ? `C${i}-USD` : `USDX${i}=X`;
    const interval = i % 3 === 0 ? '1wk' : '1d';
    return { id: `${symbol}|${interval}`, symbol, interval, addedAt: 1_762_300_000_000 + i, kind: k };
  });
  const state: Record<string, unknown> = {
    [WATCH_KEY]: { version: 1, items: items.map(({ id, symbol, interval, addedAt }) => ({ id, symbol, interval, addedAt })) },
    [SETTINGS_KEY]: { version: 1, filter: 'all', autoRefresh: true, firstOpenAt: 1_762_300_000_000, notification: { promptDismissedAt: null, lastResult: null } },
    [CACHE_KEY]: { version: 1, items: Object.fromEntries(items.map((it) => [it.id, { price: 512_000.5, prevClose: 509_191.25, rsi: 28.37, fetchedAt: 1_762_300_000_000 }])) },
    [CHANGES_KEY]: {
      version: 1,
      items: Array.from({ length: CHANGES_MAX }, (_, i) => ({ kind: 'rsi_low_enter', watchId: items[i % items.length].id, date: '2026-11-05', at: 1_762_300_000_000, from: 30.12, to: 29.87 })),
    },
    [`${STATIC_CACHE_PREFIX}symbols`]: { version: 1, fetchedOn: '2026-11-05', etag: 'W/"6a1f-18f3c2a9b10"', data: bundledSymbols },
    [`${STATIC_CACHE_PREFIX}universe`]: { version: 1, fetchedOn: '2026-11-05', etag: 'W/"6a1f-18f3c2a9b10"', data: bundledUniverse },
    [`${STATIC_CACHE_PREFIX}content`]: { version: 1, fetchedOn: '2026-11-05', etag: 'W/"6a1f-18f3c2a9b10"', data: bundledContent },
  };
  items.forEach((it, i) => (state[BARS_KEY_PREFIX + it.id] = barsCache(it.kind, 7 + i)));
  return state;
}

describe('Storage 저장량(최악: 100종목 · 봉 530개씩)', () => {
  it('종목 하나 봉 저장 · 값 하나 · 전체가 예산 안', () => {
    const state = worstCase();
    const sizes = Object.entries(state).map(([k, v]) => ({ k, n: bytes(k) + bytes(JSON.stringify(v)) }));
    const barsSizes = sizes.filter((s) => s.k.startsWith(BARS_KEY_PREFIX)).map((s) => s.n);
    const total = sizes.reduce((a, s) => a + s.n, 0);
    const largest = sizes.reduce((a, s) => (s.n > a.n ? s : a));
    console.info(
      `[storage] 키 ${sizes.length}개 · 전체 ${(total / 1024).toFixed(0)} KB(예산 ${BUDGET_TOTAL / 1024}) · 봉 저장 종목당 최대 ${(Math.max(...barsSizes) / 1024).toFixed(1)} KB(예산 ${BUDGET_BARS_ITEM / 1024}) · 가장 큰 값 ${largest.k} ${(largest.n / 1024).toFixed(1)} KB`,
    );
    expect(barsSizes).toHaveLength(WATCH_MAX);
    expect(Math.max(...barsSizes)).toBeLessThanOrEqual(BUDGET_BARS_ITEM);
    expect(largest.n).toBeLessThanOrEqual(BUDGET_ONE_VALUE);
    expect(total).toBeLessThanOrEqual(BUDGET_TOTAL);
  });

  it('반올림 안 된 값(부동소수 꼬리)이면 종목당 예산을 넘어요 — 서버 반올림이 필요한 이유', () => {
    const v = barsCache('USD', 11);
    const noisy = { ...v, c: v.c.map((x) => x + 1.2207031e-6), l: v.l.map((x) => x + 3.0517578e-6) };
    expect(bytes(JSON.stringify(noisy))).toBeGreaterThan(BUDGET_BARS_ITEM);
  });
});
