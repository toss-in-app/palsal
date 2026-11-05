import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ChangeItem } from '../state/changes';
import { ChangesScreen } from './ChangesScreen';

function renderChanges(items: ChangeItem[], notificationCard?: { onAgree: () => void; onDismiss: () => void }) {
  const onOpen = vi.fn();
  render(
    <TDSMobileAITProvider brandPrimaryColor="#3182F6">
      <ChangesScreen today="2026-11-05" items={items} cards={{ entries: {}, latestAt: null }} onOpen={onOpen} notificationCard={notificationCard} />
    </TDSMobileAITProvider>,
  );
  return onOpen;
}

describe('ChangesScreen', () => {
  it('목록을 누르면 그 종목으로', () => {
    const c: ChangeItem = { kind: 'rsi_low_enter', watchId: '035720.KS|1wk', date: '2026-10-28', at: 1, from: 31.2, to: 29.8 };
    const onOpen = renderChanges([c]);
    expect(screen.getByText('카카오 RSI가 30 아래로 내려왔어요')).toBeInTheDocument();
    expect(screen.getByText('주봉 · RSI 31.2 → 29.8 · 10월 28일')).toBeInTheDocument();
    fireEvent.click(screen.getByText('카카오 RSI가 30 아래로 내려왔어요'));
    expect(onOpen).toHaveBeenCalledWith(c);
  });

  it('없으면 한 줄', () => {
    renderChanges([]);
    expect(screen.getByText('최근 7일 동안 바뀐 것이 없어요')).toBeInTheDocument();
  });

  it('알림 받기 카드: 받기 · 닫기, 넘기지 않으면 없음', () => {
    const card = { onAgree: vi.fn(), onDismiss: vi.fn() };
    renderChanges([], card);
    fireEvent.click(screen.getByRole('button', { name: '알림 받기' }));
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(card.onAgree).toHaveBeenCalled();
    expect(card.onDismiss).toHaveBeenCalled();
  });

  it('카드를 넘기지 않으면 보이지 않아요', () => {
    renderChanges([]);
    expect(screen.queryByRole('button', { name: '알림 받기' })).not.toBeInTheDocument();
  });
});
