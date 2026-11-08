import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bundledContent, symbolIndex } from '../content';
import { formatPrice, formatRsi } from '../lib/format';
import { rsiSeries } from '../lib/indicators';
import { HOLD_MS } from '../lib/useChartGestures';
import { analyze, type Bars } from '../lib/series';
import type { QuoteRow } from '../data/types';
import type { CardsState } from '../state/cards';
import { defaultSettings, settingsStore } from '../state/settings';
import type { WatchItem } from '../state/watch';
import { StockScreen } from './StockScreen';

function bars(): Bars {
  const day0 = Date.parse('2025-03-03T00:00:00Z') / 1000;
  const c = Array.from({ length: 320 }, (_, i) => 50000 + 8000 * Math.sin(i / 25) - i * 20);
  return { interval: '1d', tz: 'Asia/Seoul', t: c.map((_, i) => day0 + i * 86400), c, l: c.map((v) => v * 0.99), high5y: 90000 };
}

function renderStock(watched: WatchItem[] = [], quote: QuoteRow | null = null) {
  const b = bars();
  const cards: CardsState = { entries: { '035720.KS|1d': { status: 'ready', bars: b, quote, last: null, analysis: analyze(b, false) } }, latestAt: null };
  const h = { onAdd: vi.fn(), onRemove: vi.fn() };
  render(
    <TDSMobileAITProvider brandPrimaryColor="#3182F6">
      <StockScreen
        symbol="035720.KS"
        interval="1d"
        info={symbolIndex.get('035720.KS')}
        cards={cards}
        watched={watched}
        glossary={bundledContent.glossary}
        disclaimer={bundledContent.disclaimer}
        {...h}
      />
    </TDSMobileAITProvider>,
  );
  return h;
}

describe('StockScreen', () => {
  it('시세를 못 받았으면 안내 + 다시 시도만 — 가격 자리의 회색 상자(받는 중 표시)는 남기지 않아요', () => {
    const cards: CardsState = { entries: { 'ZZZZ9|1d': { status: 'error', bars: null, quote: null, last: null, analysis: null } }, latestAt: null };
    const { container } = render(
      <TDSMobileAITProvider brandPrimaryColor="#3182F6">
        <StockScreen symbol="ZZZZ9" interval="1d" info={undefined} cards={cards} watched={[]} glossary={bundledContent.glossary} disclaimer={bundledContent.disclaimer} onAdd={vi.fn()} onRemove={vi.fn()} />
      </TDSMobileAITProvider>,
    );
    expect(screen.getByText('시세를 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(container.querySelector('.skeleton')).toBeNull();
    expect(screen.getByRole('button', { name: '내 종목에 담기 · 일봉' })).toBeInTheDocument();
  });

  it('이름 · 가격 · 두 차트 · 소식 · 면책', () => {
    renderStock();
    expect(screen.getByText('카카오')).toBeInTheDocument();
    // 차트는 그 자리에서 움직여요 — 가격 칸이 구간을 읽어 주고, RSI 칸은 같은 구간
    expect(screen.getByRole('img', { name: /^카카오 일봉 차트, .*까지 180일$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RSI 14 뜻 보기' })).toBeInTheDocument();
    expect(screen.getByText('이 종목 소식')).toBeInTheDocument();
    expect(screen.getByText(bundledContent.disclaimer)).toBeInTheDocument();
  });

  it('기준 시각은 원천 체결 시각, 한국 장중이면 약 20분 늦은 시세라고 적어요(v1.13)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-06T01:00:00Z')); // 10:00 KST
    const quote: QuoteRow = {
      symbol: '035720.KS',
      price: 42000,
      prev_close: 41500,
      change_pct: 1.2,
      market_state: 'REGULAR',
      ext_session: null,
      ext_price: null,
      ext_change_pct: null,
      source: 'yahoo',
      fetched_at: '2026-11-06T01:00:00Z', // 서버가 받은 때 10:00
      market_time: '2026-11-06T00:40:00Z', // 원천 체결 09:40
    };
    renderStock([], quote);
    expect(screen.getByText('09:40 기준 · 약 20분 늦은 시세')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('말을 누르면 그 말 하나만 시트로', () => {
    renderStock();
    fireEvent.click(screen.getByRole('button', { name: 'RSI 14 뜻 보기' }));
    expect(screen.getByText(bundledContent.glossary.rsi14.body)).toBeInTheDocument();
    expect(screen.queryByText(bundledContent.glossary.ma120.body)).not.toBeInTheDocument();
  });

  it('담지 않은 종목은 담기', () => {
    const h = renderStock();
    fireEvent.click(screen.getByRole('button', { name: '내 종목에 담기 · 일봉' }));
    expect(h.onAdd).toHaveBeenCalledWith('035720.KS', '1d');
  });

  it('담은 종목은 빼기', () => {
    const h = renderStock([{ id: '035720.KS|1d', symbol: '035720.KS', interval: '1d', addedAt: 0 }]);
    fireEvent.click(screen.getByRole('button', { name: '내 종목에서 빼기' }));
    expect(h.onRemove).toHaveBeenCalledWith('035720.KS|1d');
  });
});

describe('차트를 그 자리에서(들어가는 화면 없이)', () => {
  beforeEach(() => settingsStore.set(defaultSettings()));
  const hint = /옆으로 밀면 지난 봉/;
  const chart = () => screen.getByRole('img', { name: /카카오 일봉 차트/ });
  const close = (i: number) => 50000 + 8000 * Math.sin(i / 25) - i * 20;
  const tap = (clientX: number) => {
    fireEvent.pointerDown(chart(), { pointerId: 1, pointerType: 'touch', clientX, clientY: 100, button: 0 });
    fireEvent.pointerUp(chart(), { pointerId: 1, pointerType: 'touch', clientX, clientY: 100, button: 0 });
  };

  it('짧게 누르면 아무것도 안 바뀌고, 누르고 있으면 그 봉 값이 위 가격 · RSI 자리에, 떼면 원래대로', () => {
    vi.useFakeTimers();
    try {
      const depth = window.history.length;
      renderStock();
      expect(screen.getByText(hint)).toBeInTheDocument();
      const latest = formatPrice(close(319), 'KRW');
      tap(2);
      act(() => vi.advanceTimersByTime(50));
      expect(screen.getByText(latest)).toBeInTheDocument();
      expect(screen.queryByText('2025년 7월 21일')).not.toBeInTheDocument();
      // 누르고 있기(320ms) → 그래프 왼쪽 끝 = 보이는 첫 봉(141번째 날, 2025-07-21)
      fireEvent.pointerDown(chart(), { pointerId: 1, pointerType: 'touch', clientX: 2, clientY: 100, button: 0 });
      act(() => vi.advanceTimersByTime(HOLD_MS + 10));
      expect(screen.getByText('2025년 7월 21일')).toBeInTheDocument();
      expect(screen.getByText(formatPrice(close(140), 'KRW'))).toBeInTheDocument();
      const rsi140 = rsiSeries(Array.from({ length: 320 }, (_, i) => close(i)))[140]!;
      expect(screen.getByText(formatRsi(rsi140))).toBeInTheDocument();
      // 평소 줄들은 자리를 지킨 채 숨겨져요(높이 그대로)
      expect(screen.getByText(/5년 최고가/).closest('[aria-hidden="true"]')).not.toBeNull();
      fireEvent.pointerUp(chart(), { pointerId: 1, pointerType: 'touch', clientX: 2, clientY: 100, button: 0 });
      expect(screen.queryByText('2025년 7월 21일')).not.toBeInTheDocument();
      expect(screen.getByText(latest)).toBeInTheDocument();
      // 화면을 쌓지 않아요(뒤로가기 한 번이면 이전 화면)
      expect(window.history.length).toBe(depth);
      // 한 번 써 봤으니 다음에 열면 안내가 없어요
      expect(settingsStore.get().chartUsedAt).not.toBeNull();
      cleanup();
      renderStock();
      expect(screen.queryByText(hint)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('확대·축소 단추 · 키보드로 보이는 봉 수와 구간이 바뀌고, 지난 봉이면 최근으로', () => {
    renderStock();
    expect(chart()).toHaveAccessibleName(/까지 180일$/);
    fireEvent.click(screen.getByRole('button', { name: '확대' }));
    expect(chart()).toHaveAccessibleName(/까지 120일$/);
    fireEvent.click(screen.getByRole('button', { name: '축소' }));
    fireEvent.click(screen.getByRole('button', { name: '축소' }));
    expect(chart()).toHaveAccessibleName(/까지 270일$/);
    fireEvent.click(screen.getByRole('button', { name: '축소' }));
    expect(chart()).toHaveAccessibleName(/까지 320일$/);
    expect(screen.getByRole('button', { name: '축소' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '확대' }));
    expect(screen.queryByRole('button', { name: '최근으로' })).not.toBeInTheDocument();
    fireEvent.keyDown(chart(), { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: '최근으로' }));
    expect(screen.queryByRole('button', { name: '최근으로' })).not.toBeInTheDocument();
  });
});
