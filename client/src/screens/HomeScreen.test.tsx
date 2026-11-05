import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { bundledContent } from '../content';
import { analyze, type Bars } from '../lib/series';
import type { CardEntry, CardsState } from '../state/cards';
import type { ChangeItem } from '../state/changes';
import type { Filter } from '../state/settings';
import type { WatchItem } from '../state/watch';
import { summaryText } from '../lib/changeView';
import { HomeScreen } from './HomeScreen';

const item = (symbol: string): WatchItem => ({ id: `${symbol}|1d`, symbol, interval: '1d', addedAt: 0 });

/** 마지막 RSI 가 대략 target 쪽으로 가는 봉 */
function bars(trend: number): Bars {
  const day0 = Date.parse('2025-06-02T00:00:00Z') / 1000;
  const c = Array.from({ length: 300 }, (_, i) => 100 * (1 + trend * Math.min(i, 280) * 0.003) + Math.sin(i / 3));
  return { interval: '1d', tz: 'Asia/Seoul', t: c.map((_, i) => day0 + i * 86400), c, l: c.map((v) => v * 0.99), high5y: 200 };
}

function entry(b: Bars): CardEntry {
  return { status: 'ready', bars: b, quote: null, last: null, analysis: analyze(b, false) };
}

function renderHome(items: WatchItem[], cards: CardsState, filter: Filter = 'all', changes: ChangeItem[] = []) {
  const h = { onFilter: vi.fn(), onAdd: vi.fn(), onOpenMarket: vi.fn(), onOpen: vi.fn(), onToast: vi.fn(), onOpenChange: vi.fn(), onAllChanges: vi.fn() };
  render(
    <TDSMobileAITProvider brandPrimaryColor="#3182F6">
      <HomeScreen
        today="2026-11-05"
        items={items}
        cards={cards}
        filter={filter}
        autoRefresh={false}
        notice={null}
        disclaimer={bundledContent.disclaimer}
        online
        changes={changes}
        {...h}
      />
    </TDSMobileAITProvider>,
  );
  return h;
}

describe('HomeScreen', () => {
  it('빈 목록: 날짜 · 안내 · 면책 문단, 버튼이 담기·시장으로', () => {
    const h = renderHome([], { entries: {}, latestAt: null });
    expect(screen.getByText('내 종목 0')).toBeInTheDocument();
    expect(screen.getByText('11월 5일 목요일')).toBeInTheDocument();
    expect(screen.getByText('담아 둔 종목이 없어요')).toBeInTheDocument();
    expect(screen.getByText(bundledContent.disclaimer)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '첫 종목 담기' }));
    fireEvent.click(screen.getByRole('button', { name: '시장에서 큰 종목 보기' }));
    expect(h.onAdd).toHaveBeenCalledTimes(1);
    expect(h.onOpenMarket).toHaveBeenCalledTimes(1);
  });

  it('카드: 이름 · 코드 · RSI · 구간, 누르면 자세히', () => {
    const down = entry(bars(-1));
    const up = entry(bars(1));
    const items = [item('035720.KS'), item('005930.KS')];
    const h = renderHome(items, { entries: { '035720.KS|1d': down, '005930.KS|1d': up }, latestAt: Date.parse('2026-11-05T06:30:00Z') });
    expect(screen.getByText('11월 5일 목요일 · 15:30 기준')).toBeInTheDocument();
    expect(screen.getByText('카카오')).toBeInTheDocument();
    expect(screen.getByText('035720 · 코스피')).toBeInTheDocument();
    expect(screen.getAllByText('RSI 14')).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: /최근 180일 가격과 이동평균/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole('link', { name: /^카카오 일봉/ }));
    expect(h.onOpen).toHaveBeenCalledWith(items[0]);
    // 머리의 '+' 와 목록 끝 버튼
    expect(screen.getAllByRole('button', { name: '종목 담기' })).toHaveLength(2);
  });

  it('칩 숫자는 RSI 구간 수, 누르면 걸러 보기', () => {
    const items = [item('035720.KS'), item('005930.KS'), item('NVDA')];
    const cards: CardsState = {
      entries: {
        '035720.KS|1d': { status: 'idle', bars: null, quote: null, last: { price: 1, prevClose: 1, rsi: 25, fetchedAt: 0 }, analysis: null },
        '005930.KS|1d': { status: 'idle', bars: null, quote: null, last: { price: 1, prevClose: 1, rsi: 71, fetchedAt: 0 }, analysis: null },
        'NVDA|1d': { status: 'idle', bars: null, quote: null, last: { price: 1, prevClose: 1, rsi: 50, fetchedAt: 0 }, analysis: null },
      },
      latestAt: null,
    };
    const h = renderHome(items, cards);
    fireEvent.click(screen.getByRole('button', { name: '30 아래 1' }));
    expect(screen.getByRole('button', { name: '70 위 1' })).toHaveAttribute('aria-pressed', 'false');
    expect(h.onFilter).toHaveBeenCalledWith('low');
  });

  it('걸러서 없으면 한 줄 안내', () => {
    renderHome([item('NVDA')], { entries: {}, latestAt: null }, 'high');
    expect(screen.getByText('지금은 RSI 70 위인 종목이 없어요')).toBeInTheDocument();
  });

  it('불러오지 못한 카드엔 다시 시도', () => {
    renderHome([item('NVDA')], { entries: { 'NVDA|1d': { status: 'error', bars: null, quote: null, last: null, analysis: null } }, latestAt: null });
    expect(screen.getByText('시세를 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('최근 바뀐 것 배너: 제목 · 봉 · RSI 전후, 누르면 그 종목 · 모두 보기', () => {
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const changes: ChangeItem[] = [
      { kind: 'rsi_high_enter', watchId: 'NVDA|1d', date: today, at: 1, from: 68.2, to: 71.4 },
      { kind: 'ma_cross_up', watchId: '005930.KS|1d', date: today, at: 1, from: null, to: null },
    ];
    const h = renderHome([item('NVDA'), item('005930.KS')], { entries: {}, latestAt: null }, 'all', changes);
    expect(screen.getByText('엔비디아 RSI가 70을 넘었어요')).toBeInTheDocument();
    expect(screen.getByText('일봉 · RSI 68.2 → 71.4 · 오늘')).toBeInTheDocument();
    expect(screen.getByText('삼성전자 60일선이 120일선을 위로 넘었어요')).toBeInTheDocument();
    fireEvent.click(screen.getByText('엔비디아 RSI가 70을 넘었어요'));
    expect(h.onOpenChange).toHaveBeenCalledWith(changes[0]);
    fireEvent.click(screen.getByRole('button', { name: '모두 보기' }));
    expect(h.onAllChanges).toHaveBeenCalled();
  });

  it('바뀐 것이 없으면 배너를 숨겨요', () => {
    renderHome([item('NVDA')], { entries: {}, latestAt: null });
    expect(screen.queryByText('모두 보기')).not.toBeInTheDocument();
  });

  it('열 때 요약 문구', () => {
    expect(summaryText(2, 1)).toBe('지금 RSI 30 아래 2개, 70 위 1개예요');
    expect(summaryText(0, 1)).toBe('지금 RSI 70 위 1개예요');
    expect(summaryText(0, 0)).toBeNull();
  });
});
