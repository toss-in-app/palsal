import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtureSource } from '../data/fixture';
import type { MarketSource, QuoteRow } from '../data/types';
import { readJson } from '../lib/storage';
import { barsDay, BARS_KEY_PREFIX, cardsStore, isStale, loadCards, refreshQuotes, resetCards, retryCard, setMarketSource } from './cards';
import { watchStore, type WatchItem } from './watch';

const NOW = Date.parse('2026-11-05T06:40:00Z'); // 15:40 KST
const item = (symbol: string, interval: WatchItem['interval'] = '1d'): WatchItem => ({ id: `${symbol}|${interval}`, symbol, interval, addedAt: 0 });

/** 예시 데이터 출처에서 'ZZZZ' 만 서버에 없는 종목처럼 */
function fakeSource(): MarketSource & { calls: { bars: string[][]; track: string[][] } } {
  const base = fixtureSource(() => NOW, 0);
  const calls = { bars: [] as string[][], track: [] as string[][] };
  return {
    calls,
    quotes: async (s) => (await base.quotes(s.filter((x) => x !== 'ZZZZ'))) as QuoteRow[],
    bars: async (k) => {
      calls.bars.push(k);
      return base.bars(k.filter((x) => !x.startsWith('ZZZZ')));
    },
    track: async (s) => {
      calls.track.push(s);
    },
  };
}

beforeEach(() => {
  resetCards();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

describe('barsDay', () => {
  it('서버가 봉을 넣는 시각이 지나야 그날로 바뀌어요', () => {
    expect(barsDay('KR', Date.parse('2026-11-05T07:00:00Z'))).toBe('2026-11-04'); // 16:00 KST
    expect(barsDay('KR', Date.parse('2026-11-05T07:45:00Z'))).toBe('2026-11-05'); // 16:45 KST
    expect(barsDay('US', Date.parse('2026-11-04T21:00:00Z'))).toBe('2026-11-04'); // 06:00 KST 5일
    expect(barsDay('US', Date.parse('2026-11-04T22:30:00Z'))).toBe('2026-11-05'); // 07:30 KST 5일
  });
});

describe('loadCards', () => {
  it('봉·현재가를 받아 계산하고, 담은 종목의 봉은 그날 하루 기기에 저장해요', async () => {
    const src = fakeSource();
    setMarketSource(src);
    watchStore.set({ ready: true, items: [item('NVDA'), item('005930.KS', '1wk')] });
    await loadCards([item('NVDA'), item('005930.KS', '1wk')]);
    const e = cardsStore.get().entries['NVDA|1d'];
    expect(e.status).toBe('ready');
    expect(e.analysis?.rsi).not.toBeNull();
    expect(e.quote?.symbol).toBe('NVDA');
    expect(cardsStore.get().latestAt).toBe(Date.parse('2026-11-05T06:40:00Z'));
    const saved = (await readJson(`${BARS_KEY_PREFIX}NVDA|1d`)) as { day: string; c: number[] };
    expect(saved.day).toBe(barsDay('US', NOW));
    expect(saved.c.length).toBeGreaterThan(400);

    // 다음에 열 때(같은 날)는 봉을 다시 받지 않아요
    resetCards();
    await loadCards([item('NVDA')]);
    expect(src.calls.bars).toEqual([['NVDA|1d', '005930.KS|1wk']]);
    expect(cardsStore.get().entries['NVDA|1d'].status).toBe('ready');
    expect(cardsStore.get().entries['NVDA|1d'].analysis?.rsi).toBe(e.analysis?.rsi);
  });

  it('담지 않은 종목(시장·딥링크로 잠깐 본 것)은 기기에 저장하지 않아요', async () => {
    setMarketSource(fakeSource());
    watchStore.set({ ready: true, items: [] });
    await loadCards([item('AAPL')]);
    expect(cardsStore.get().entries['AAPL|1d'].status).toBe('ready');
    expect(await readJson(`${BARS_KEY_PREFIX}AAPL|1d`)).toBeNull();
  });

  it('서버에 없는 종목은 지켜봐 달라고 하고 기다려요', async () => {
    const src = fakeSource();
    setMarketSource(src);
    await loadCards([item('ZZZZ')]);
    expect(src.calls.track).toEqual([['ZZZZ']]);
    expect(cardsStore.get().entries['ZZZZ|1d'].status).toBe('pending');
  });

  it('읽기에 실패하면 error, 다시 시도로 회복', async () => {
    const ok = fakeSource();
    setMarketSource({ ...ok, bars: () => Promise.reject(new Error('down')) });
    await loadCards([item('TSLA')]);
    expect(cardsStore.get().entries['TSLA|1d'].status).toBe('error');
    setMarketSource(ok);
    await retryCard(item('TSLA'));
    expect(cardsStore.get().entries['TSLA|1d'].status).toBe('ready');
  });

  it('새로고침은 현재가만 다시 읽어요', async () => {
    const src = fakeSource();
    setMarketSource(src);
    await loadCards([item('NVDA')]);
    expect(await refreshQuotes([item('NVDA')])).toBe('ok');
    setMarketSource({ ...src, quotes: () => Promise.reject(new Error('down')) });
    expect(await refreshQuotes([item('NVDA')])).toBe('error');
    expect(src.calls.bars).toHaveLength(1);
  });
});

describe('isStale', () => {
  const quote = (state: QuoteRow['market_state'], iso: string) => ({ market_state: state, fetched_at: iso }) as QuoteRow;
  it('장중인데 20분보다 오래되면', () => {
    expect(isStale(quote('REGULAR', '2026-11-05T06:10:00Z'), NOW)).toBe(true);
    expect(isStale(quote('REGULAR', '2026-11-05T06:25:00Z'), NOW)).toBe(false);
    expect(isStale(quote('CLOSED', '2026-11-04T06:10:00Z'), NOW)).toBe(false);
    expect(isStale(null, NOW)).toBe(false);
  });
});
