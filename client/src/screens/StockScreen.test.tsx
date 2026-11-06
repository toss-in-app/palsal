import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { bundledContent, symbolIndex } from '../content';
import { analyze, type Bars } from '../lib/series';
import type { QuoteRow } from '../data/types';
import type { CardsState } from '../state/cards';
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
  it('이름 · 가격 · 두 차트 · 소식 · 면책', () => {
    renderStock();
    expect(screen.getByText('카카오')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /가격과 이동평균/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /RSI 흐름/ })).toBeInTheDocument();
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

describe('차트 크게 보기', () => {
  const hint = /옆으로 밀면 지난 봉이 보이고/;
  const chart = () => screen.getByRole('img', { name: /카카오 일봉 차트/ });

  it('차트를 누르면 열리고, 토스앱 뒤로가기(히스토리 한 칸)로 닫혀요', async () => {
    renderStock();
    fireEvent.click(screen.getByRole('button', { name: '가격 차트 크게 보기' }));
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ overlay: 'chart' });
    // 처음엔 자세히 차트와 같은 최근 180봉
    expect(chart()).toHaveAccessibleName(/까지 180일$/);
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RSI 차트 크게 보기' })).toBeInTheDocument();
  });

  it('확대·축소 버튼 · 키보드로 보이는 봉 수와 구간이 바뀌어요', () => {
    renderStock();
    fireEvent.click(screen.getByRole('button', { name: '크게 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '확대' }));
    expect(chart()).toHaveAccessibleName(/까지 120일$/);
    fireEvent.click(screen.getByRole('button', { name: '축소' }));
    fireEvent.click(screen.getByRole('button', { name: '축소' }));
    expect(chart()).toHaveAccessibleName(/까지 270일$/);
    fireEvent.click(screen.getByRole('button', { name: '축소' }));
    expect(chart()).toHaveAccessibleName(/까지 320일$/);
    expect(screen.getByRole('button', { name: '축소' })).toBeDisabled();
    // 왼쪽 화살표 = 지난 봉 쪽으로 → '최근으로'가 생기고, 누르면 돌아와요
    fireEvent.click(screen.getByRole('button', { name: '확대' }));
    expect(screen.queryByRole('button', { name: '최근으로' })).not.toBeInTheDocument();
    fireEvent.keyDown(chart(), { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: '최근으로' }));
    expect(screen.queryByRole('button', { name: '최근으로' })).not.toBeInTheDocument();
  });

  it('짧게 누르면 그 봉의 값, 같은 자리를 한 번 더 누르면 최신 봉으로', () => {
    renderStock();
    fireEvent.click(screen.getByRole('button', { name: 'RSI 차트 크게 보기' }));
    const last = screen.getByText('1월 16일'); // 최신 봉(320번째 날, 2026-01-16)
    expect(last).toBeInTheDocument();
    const tap = (clientX: number) => {
      fireEvent.pointerDown(chart(), { pointerId: 1, pointerType: 'touch', clientX, clientY: 100, button: 0 });
      fireEvent.pointerUp(chart(), { pointerId: 1, pointerType: 'touch', clientX, clientY: 100, button: 0 });
    };
    tap(2); // 그래프 왼쪽 끝 = 보이는 첫 봉(141번째 날)
    expect(screen.getByText('2025년 7월 21일')).toBeInTheDocument();
    tap(2);
    expect(screen.getByText('1월 16일')).toBeInTheDocument();
  });
});
