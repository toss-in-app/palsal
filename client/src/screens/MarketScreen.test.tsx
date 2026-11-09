import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

describe('시장 고르기(전체 · 한국 · 미국 · 코인)', () => {
  const withCoins: MarketPayload = {
    ...payload,
    universe: {
      ...payload.universe,
      crypto: [
        { symbol: 'BTC-USD', rank: 1, rsi: 25.1, close: 104820, changePct: -3.2 },
        { symbol: 'ETH-USD', rank: 2, rsi: 44.0, close: 3521.4, changePct: -1.1 },
      ],
    },
  };

  it('버튼마다 그 시장의 30 아래만, 한 시장일 때는 시장 이름을 되풀이하지 않아요', () => {
    renderMarket({ status: 'ready', data: withCoins, fetchedAt: 1 });
    // 전체: 한국 · 코인이 RSI 낮은 순으로
    const all = screen.getAllByText(/ · RSI /).map((el) => el.textContent);
    expect(all).toEqual(['코인 · RSI 25.1', '한국 · RSI 27.4']);
    expect(screen.getByText('한국·미국 시총 상위 3개 · 코인 2개 중 · 일봉 RSI 14')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '코인 1' }));
    expect(screen.getByText('비트코인')).toBeInTheDocument();
    expect(screen.getByText('RSI 25.1')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '지금 RSI 30 아래인 큰 종목' })).queryByText('SK하이닉스')).not.toBeInTheDocument();
    expect(screen.getByText('주요 코인 2개 중 · 일봉 RSI 14')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '미국 0' }));
    expect(screen.getByText('지금은 RSI 30 아래인 미국 큰 종목이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '미국 0' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('서버가 아직 코인 줄을 안 넣었으면 코인 버튼은 없어요', () => {
    renderMarket({ status: 'ready', data: payload, fetchedAt: 1 });
    expect(screen.getByRole('button', { name: '전체 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^코인/ })).not.toBeInTheDocument();
    expect(screen.getByText('한국·미국 시가총액 상위 3개 중 · 일봉 RSI 14')).toBeInTheDocument();
  });
});

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

describe('VIX 카드(v1.18)', () => {
  const closes = Array.from({ length: 130 }, (_, i) => 15 + (i % 10));
  const withVix: MarketPayload = { ...payload, vix: { value: 31.2, changePct: 8.25, closes: [...closes.slice(0, -1), 31.2] } };

  it('공포탐욕 줄은 3장 그대로, VIX 는 그 아래 따로(30 아래 목록 위) — 지금 값 · 구간 · % · 기준 한 줄', () => {
    renderMarket({ status: 'ready', data: withVix, fetchedAt: 1 });
    const strip = screen.getByRole('region', { name: '공포탐욕지수' });
    expect(within(strip).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['한국 공포탐욕', '미국 공포탐욕', '코인 공포탐욕']);
    const vix = screen.getByRole('region', { name: 'VIX 변동성지수' });
    const low = screen.getByRole('region', { name: '지금 RSI 30 아래인 큰 종목' });
    expect(strip.compareDocumentPosition(vix) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vix.compareDocumentPosition(low) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(vix).getByText('31.20')).toBeInTheDocument();
    expect(within(vix).getByText('공포')).toBeInTheDocument();
    expect(within(vix).getByText('+8.25%')).toBeInTheDocument();
    expect(within(vix).getByText('20 아래 평온 · 30 넘으면 공포')).toBeInTheDocument();
  });

  it('(i)를 누르면 구간별 읽는 법 시트', () => {
    renderMarket({ status: 'ready', data: withVix, fetchedAt: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'VIX 읽는 법' }));
    expect(screen.getByText(/30~40 · 공포가 큰 편이에요/)).toBeInTheDocument();
    expect(screen.getByText(/오를지 내릴지는 알려 주지 않아요/)).toBeInTheDocument();
  });

  it('서버가 아직 VIX 를 안 넣었으면 VIX 칸 없이 공포탐욕 3장', () => {
    renderMarket({ status: 'ready', data: payload, fetchedAt: 1 });
    expect(screen.getByRole('region', { name: '공포탐욕지수' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'VIX 변동성지수' })).not.toBeInTheDocument();
  });
});
