import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtureSource } from '../data/fixture';
import { setMarketSource } from './cards';
import { loadMarket, MARKET_FRESH_MS, marketStore, resetMarket } from './market';

const NOW = Date.parse('2026-11-05T06:40:00Z');

beforeEach(() => resetMarket());

describe('loadMarket', () => {
  it('읽고, 10분 안에는 다시 읽지 않아요', async () => {
    const src = fixtureSource(() => NOW, 0);
    const spy = vi.spyOn(src, 'market');
    setMarketSource(src);
    await loadMarket(false, NOW);
    expect(marketStore.get().status).toBe('ready');
    await loadMarket(false, NOW + 60_000);
    expect(spy).toHaveBeenCalledTimes(1);
    await loadMarket(false, NOW + MARKET_FRESH_MS + 1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('처음부터 실패하면 error, 지난 값이 있으면 그대로', async () => {
    const ok = fixtureSource(() => NOW, 0);
    setMarketSource({ ...ok, market: () => Promise.reject(new Error('down')) });
    await loadMarket(true, NOW);
    expect(marketStore.get().status).toBe('error');
    setMarketSource(ok);
    await loadMarket(true, NOW);
    setMarketSource({ ...ok, market: () => Promise.reject(new Error('down')) });
    await loadMarket(true, NOW);
    expect(marketStore.get()).toMatchObject({ status: 'ready' });
    expect(marketStore.get().data).not.toBeNull();
  });
});
