import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { bundledContent, bundledUniverse } from '../content';
import type { MarketPayload } from '../data/types';
import type { MarketState } from '../state/market';
import type { WatchItem } from '../state/watch';
import { MarketScreen } from './MarketScreen';

const payload: MarketPayload = {
  schema: 1,
  asOf: '2026-11-05T06:40:00Z',
  computedAt: '2026-11-05T06:30:00Z',
  stale: false,
  universeVersion: '2026-11-01.1',
  fearGreed: {
    kr: { score: 38, label: '공포', basis: '코스피 RSI와 120일선 위치' },
    us: { score: 61, label: '탐욕', basis: 'SPY RSI와 120일선 위치' },
    crypto: { score: 22, label: '극단적 공포', basis: 'alternative.me 코인 공포탐욕지수', attribution: '출처 alternative.me', sourceDate: '2026-11-05' },
  },
  universe: {
    kr: [
      { symbol: '005930.KS', rank: 1, rsi: 51.2, close: 104500, changePct: 1.1 },
      { symbol: '000660.KS', rank: 2, rsi: 27.4, close: 512000, changePct: -0.5 },
    ],
    us: [{ symbol: 'NVDA', rank: 1, rsi: 71.1, close: 201.37, changePct: 2.9 }],
  },
  low: ['000660.KS'],
};

function renderMarket(market: MarketState, watched: WatchItem[] = []) {
  const h = { onRetry: vi.fn(), onOpen: vi.fn(), onAdd: vi.fn() };
  render(
    <TDSMobileAITProvider brandPrimaryColor="#3182F6">
      <MarketScreen today="2026-11-05" market={market} universe={bundledUniverse} watched={watched} glossary={bundledContent.glossary} {...h} />
    </TDSMobileAITProvider>,
  );
  return h;
}

describe('MarketScreen', () => {
  it('공포탐욕 3 · 30 아래 · 순위 · 기준 시각', () => {
    renderMarket({ status: 'ready', data: payload, fetchedAt: 1 });
    expect(screen.getByRole('img', { name: '38점 공포' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '61점 탐욕' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '22점 극단적 공포' })).toBeInTheDocument();
    expect(screen.getByText('출처 alternative.me')).toBeInTheDocument();
    expect(screen.getByText('한국 · RSI 27.4')).toBeInTheDocument();
    expect(screen.getByText('30분마다 다시 계산해요 · 15:30 기준')).toBeInTheDocument();
  });

  it('30 아래 종목 담기: 봉 단위 고르고 담아요', () => {
    const h = renderMarket({ status: 'ready', data: payload, fetchedAt: 1 });
    fireEvent.click(screen.getByRole('button', { name: '담기' }));
    fireEvent.click(screen.getByText('주봉'));
    fireEvent.click(screen.getByRole('button', { name: '주봉으로 담기' }));
    expect(h.onAdd).toHaveBeenCalledWith('000660.KS', '1wk');
  });

  it('이미 담은 종목은 담음, 순위 한국/미국, 누르면 자세히', () => {
    const h = renderMarket({ status: 'ready', data: payload, fetchedAt: 1 }, [{ id: '000660.KS|1d', symbol: '000660.KS', interval: '1d', addedAt: 0 }]);
    expect(screen.getByRole('button', { name: '담음' })).toBeDisabled();
    fireEvent.click(screen.getByText('미국'));
    fireEvent.click(screen.getByText('엔비디아'));
    expect(h.onOpen).toHaveBeenCalledWith('NVDA');
  });

  it('불러오지 못하면 다시 시도', () => {
    const h = renderMarket({ status: 'error', data: null, fetchedAt: null });
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(h.onRetry).toHaveBeenCalled();
  });
});
