import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { bundledContent } from '../content';
import { HomeScreen } from './HomeScreen';

function renderHome(notice: string | null = null) {
  const handlers = { onAdd: vi.fn(), onOpenMarket: vi.fn() };
  render(
    <TDSMobileAITProvider brandPrimaryColor="#3182F6">
      <HomeScreen today="2026-11-05" count={0} notice={notice} disclaimer={bundledContent.disclaimer} {...handlers} />
    </TDSMobileAITProvider>,
  );
  return handlers;
}

describe('HomeScreen', () => {
  it('빈 목록: 날짜 · 안내 · 면책 문단', () => {
    renderHome();
    expect(screen.getByText('내 종목 0')).toBeInTheDocument();
    expect(screen.getByText('11월 5일 목요일')).toBeInTheDocument();
    expect(screen.getByText('담아 둔 종목이 없어요')).toBeInTheDocument();
    expect(screen.getByText(bundledContent.disclaimer)).toBeInTheDocument();
  });

  it('버튼이 담기·시장으로 보내요', () => {
    const h = renderHome();
    fireEvent.click(screen.getByRole('button', { name: '첫 종목 담기' }));
    fireEvent.click(screen.getByRole('button', { name: '시장에서 큰 종목 보기' }));
    expect(h.onAdd).toHaveBeenCalledOnce();
    expect(h.onOpenMarket).toHaveBeenCalledOnce();
  });

  it('공지가 있으면 맨 위 한 줄', () => {
    renderHome('11월 6일 새벽 점검이 있어요');
    expect(screen.getByText('11월 6일 새벽 점검이 있어요')).toBeInTheDocument();
  });
});
