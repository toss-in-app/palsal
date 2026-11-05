import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { bundledContent, symbolIndex } from '../content';
import { analyze, type Bars } from '../lib/series';
import type { CardsState } from '../state/cards';
import type { WatchItem } from '../state/watch';
import { StockScreen } from './StockScreen';

function bars(): Bars {
  const day0 = Date.parse('2025-03-03T00:00:00Z') / 1000;
  const c = Array.from({ length: 320 }, (_, i) => 50000 + 8000 * Math.sin(i / 25) - i * 20);
  return { interval: '1d', tz: 'Asia/Seoul', t: c.map((_, i) => day0 + i * 86400), c, l: c.map((v) => v * 0.99), high5y: 90000 };
}

function renderStock(watched: WatchItem[] = []) {
  const b = bars();
  const cards: CardsState = { entries: { '035720.KS|1d': { status: 'ready', bars: b, quote: null, last: null, analysis: analyze(b, false) } }, latestAt: null };
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
