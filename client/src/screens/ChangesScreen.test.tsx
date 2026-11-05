import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ChangeItem } from '../state/changes';
import { ChangesScreen } from './ChangesScreen';

function renderChanges(items: ChangeItem[]) {
  const onOpen = vi.fn();
  render(
    <TDSMobileAITProvider brandPrimaryColor="#3182F6">
      <ChangesScreen today="2026-11-05" items={items} cards={{ entries: {}, latestAt: null }} onOpen={onOpen} />
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
});
