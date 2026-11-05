import type { MarketPayload } from '../data/types';
import { currentSource } from './cards';
import { createStore, useStore } from './store';

/*
 * 시장 탭 값(palsal_market — 서버가 장중 30분마다 계산). 탭을 열 때 10분보다 오래됐으면 다시 읽어요.
 * 실패하면 지난 값이 있으면 그대로 두고, 없으면 '시장 정보를 불러오지 못했어요'.
 */
export const MARKET_FRESH_MS = 10 * 60_000;

export interface MarketState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: MarketPayload | null;
  fetchedAt: number | null;
}

export const marketStore = createStore<MarketState>({ status: 'idle', data: null, fetchedAt: null });

export async function loadMarket(force = false, now = Date.now()): Promise<void> {
  const s = marketStore.get();
  if (s.status === 'loading') return;
  if (!force && s.data && s.fetchedAt && now - s.fetchedAt < MARKET_FRESH_MS) return;
  const source = currentSource();
  if (!source) return;
  marketStore.set({ ...s, status: 'loading' });
  try {
    const data = await source.market();
    marketStore.set(data ? { status: 'ready', data, fetchedAt: now } : { ...marketStore.get(), status: s.data ? 'ready' : 'error' });
  } catch {
    marketStore.set({ ...marketStore.get(), status: s.data ? 'ready' : 'error' });
  }
}

/** 테스트용 */
export function resetMarket(): void {
  marketStore.set({ status: 'idle', data: null, fetchedAt: null });
}

export function useMarket(): MarketState {
  return useStore(marketStore);
}
