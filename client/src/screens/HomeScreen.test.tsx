import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { bundledContent } from '../content';
import { analyze, type Bars } from '../lib/series';
import type { CardEntry, CardsState } from '../state/cards';
import type { ChangeItem } from '../state/changes';
import type { Filter } from '../state/settings';
import type { WatchItem } from '../state/watch';
import { summaryText } from '../lib/changeView';
import { HomeScreen, MORE_DELAY_MS, PAGE } from './HomeScreen';

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
  const h = { onFilter: vi.fn(), onAdd: vi.fn(), onOpenMarket: vi.fn(), onOpen: vi.fn(), onToast: vi.fn(), onOpenChange: vi.fn(), onAllChanges: vi.fn(), onRemove: vi.fn(), onReorder: vi.fn() };
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
    // 머리 시각은 서버에서 받은 때(업데이트). 국내 종목이 있으면 '약 20분 늦은 시세' 한 줄(v1.13)
    expect(screen.getByText('11월 5일 목요일 · 15:30 업데이트')).toBeInTheDocument();
    expect(screen.getByText('국내 주식·지수는 약 20분 늦은 시세예요')).toBeInTheDocument();
    expect(screen.getByText('카카오')).toBeInTheDocument();
    expect(screen.getByText('035720 · 코스피')).toBeInTheDocument();
    // 'RSI 14' 라벨은 카드마다가 아니라 목록 머리에 한 번, 일봉 딱지는 주봉·월봉일 때만
    expect(screen.getAllByText('RSI 14 기준')).toHaveLength(1);
    expect(screen.queryByText('RSI 14')).not.toBeInTheDocument();
    expect(screen.queryByText('일봉')).not.toBeInTheDocument();
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

  it('카드를 길게 누르면 그 자리 편집 모드: 빼기 · 완료', () => {
    vi.useFakeTimers();
    try {
      const items = [item('035720.KS'), item('005930.KS')];
      const h = renderHome(items, { entries: { '035720.KS|1d': entry(bars(-1)), '005930.KS|1d': entry(bars(1)) }, latestAt: null });
      const card = screen.getByRole('link', { name: /^카카오 일봉/ });
      fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByText('끌어서 순서를 바꾸고, 빨간 버튼으로 빼요')).toBeInTheDocument();
      expect(h.onOpen).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: '삼성전자 일봉 빼기' }));
      expect(h.onRemove).toHaveBeenCalledWith(items[1]);
      fireEvent.keyDown(screen.getByRole('button', { name: '카카오 일봉 순서 옮기기' }), { key: 'ArrowDown' });
      expect(h.onReorder).toHaveBeenCalledWith(['005930.KS|1d', '035720.KS|1d']);
      fireEvent.click(screen.getByRole('button', { name: '완료' }));
      expect(screen.getByText('내 종목 2')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('짧게 누르면 자세히, 움직이면(스크롤) 편집 모드가 아니에요', () => {
    vi.useFakeTimers();
    try {
      const items = [item('035720.KS')];
      const h = renderHome(items, { entries: { '035720.KS|1d': entry(bars(-1)) }, latestAt: null });
      const card = screen.getByRole('link', { name: /^카카오 일봉/ });
      fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(card, { clientX: 10, clientY: 60 });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.queryByText('끌어서 순서를 바꾸고, 빨간 버튼으로 빼요')).not.toBeInTheDocument();
      fireEvent.click(card);
      expect(h.onOpen).toHaveBeenCalledWith(items[0]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('내 종목에서 찾기: 이름 · 초성, 없으면 한 줄, 지우면 닫혀요', () => {
    const items = [item('035720.KS'), item('005930.KS'), item('NVDA')];
    renderHome(items, { entries: {}, latestAt: null });
    fireEvent.click(screen.getByRole('button', { name: '내 종목에서 찾기' }));
    const field = screen.getByLabelText('내 종목에서 찾기', { selector: 'input' });
    fireEvent.change(field, { target: { value: 'ㅅㅅ' } });
    expect(screen.getByText('삼성전자')).toBeInTheDocument();
    expect(screen.queryByText('카카오')).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'nvda' } });
    expect(screen.getByText('엔비디아')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: '없는종목' } });
    expect(screen.getByText('내 종목에서 찾는 종목이 없어요')).toBeInTheDocument();
  });

  it('찾기를 머리 단추로 닫으면 검색어도 지워져 목록이 다 돌아와요(전엔 걸러진 채 남았어요)', () => {
    const items = [item('035720.KS'), item('005930.KS'), item('NVDA')];
    renderHome(items, { entries: {}, latestAt: null });
    fireEvent.click(screen.getByRole('button', { name: '내 종목에서 찾기' }));
    fireEvent.change(screen.getByLabelText('내 종목에서 찾기', { selector: 'input' }), { target: { value: 'ㅅㅅ' } });
    expect(screen.queryByText('카카오')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '찾기 닫기' }));
    expect(screen.queryByLabelText('내 종목에서 찾기', { selector: 'input' })).not.toBeInTheDocument();
    expect(screen.getByText('카카오')).toBeInTheDocument();
    expect(screen.getByText('삼성전자')).toBeInTheDocument();
    expect(screen.getByText('엔비디아')).toBeInTheDocument();
  });

  it('배너 광고는 둘째 카드 뒤 하나, 전면 광고 안내·AD 표시는 없어요(배너만)', () => {
    const items = [item('035720.KS'), item('005930.KS'), item('NVDA')];
    renderHome(items, { entries: { '035720.KS|1d': entry(bars(-1)), '005930.KS|1d': entry(bars(1)), 'NVDA|1d': entry(bars(1)) }, latestAt: null });
    const kids = Array.from(screen.getByRole('region', { name: '내 종목 차트' }).children);
    expect(kids.map((k) => k.getAttribute('data-testid'))).toEqual([null, null, 'ad-banner', null, null]);
    expect(screen.getAllByTestId('ad-banner')).toHaveLength(1);
    expect(screen.queryByText('AD')).not.toBeInTheDocument();
    expect(screen.queryByText(/광고가 한 번 나와요/)).not.toBeInTheDocument();
  });

  it('카드가 하나면 배너는 그 뒤', () => {
    renderHome([item('NVDA')], { entries: { 'NVDA|1d': entry(bars(1)) }, latestAt: null });
    const kids = Array.from(screen.getByRole('region', { name: '내 종목 차트' }).children);
    expect(kids[1].getAttribute('data-testid')).toBe('ad-banner');
  });
});

// 모듈 상태(보던 카드 수)를 바꾸므로 이 파일 맨 끝에 둬요
describe('끝까지 내리면 다음 카드', () => {
  it('끝 자리가 보이면 반짝이는 카드 자리를 잠깐 보여 준 뒤 다음 묶음을 붙여요', () => {
    const seen: IntersectionObserverCallback[] = [];
    class FakeIO {
      constructor(cb: IntersectionObserverCallback) {
        seen.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIO);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const e = entry(bars(-1));
    const symbols = ['035720.KS', '005930.KS', '000660.KS', '005380.KS', '247540.KQ', 'NVDA'];
    renderHome(symbols.map(item), { entries: Object.fromEntries(symbols.map((s) => [`${s}|1d`, e])), latestAt: null });
    expect(screen.getAllByRole('link')).toHaveLength(PAGE);
    expect(screen.getByRole('status', { name: '다음 종목을 불러오는 중' })).toBeInTheDocument();
    act(() => seen[seen.length - 1]([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    // 바로 붙이지 않고 반짝이는 자리가 먼저
    expect(screen.getAllByRole('link')).toHaveLength(PAGE);
    act(() => {
      vi.advanceTimersByTime(MORE_DELAY_MS);
    });
    expect(screen.getAllByRole('link')).toHaveLength(symbols.length);
    expect(screen.queryByRole('status', { name: '다음 종목을 불러오는 중' })).not.toBeInTheDocument();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('편집 모드를 다녀와도 끝 자리를 다시 지켜봐요(예전엔 떨어져 나간 옛 자리를 보고 있어 더 안 불렀어요)', () => {
    const observed: Element[] = [];
    class FakeIO {
      observe(el: Element) {
        observed.push(el);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIO);
    vi.useFakeTimers();
    try {
      const e = entry(bars(-1));
      const symbols = ['035720.KS', '005930.KS', '000660.KS', '005380.KS', '247540.KQ', 'NVDA', 'AAPL', 'TSLA', 'QQQ', 'SPY'];
      renderHome(symbols.map(item), { entries: Object.fromEntries(symbols.map((s) => [`${s}|1d`, e])), latestAt: null });
      fireEvent.pointerDown(screen.getAllByRole('link')[0], { button: 0, clientX: 10, clientY: 10 });
      act(() => vi.advanceTimersByTime(600));
      fireEvent.click(screen.getByRole('button', { name: '완료' }));
      const loader = screen.getByRole('status', { name: '다음 종목을 불러오는 중' });
      expect(observed[observed.length - 1]).toBe(loader);
      expect(loader.isConnected).toBe(true);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
