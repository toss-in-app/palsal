import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { bundledSymbols, bundledUniverse } from '../content';
import { rankIndex } from '../lib/search';
import type { WatchItem } from '../state/watch';
import { AddScreen } from './AddScreen';

function renderAdd(watched: WatchItem[] = []) {
  const h = { onAdd: vi.fn(() => 1), onDone: vi.fn(), onToast: vi.fn() };
  render(
    <TDSMobileAITProvider brandPrimaryColor="#3182F6">
      <AddScreen symbols={bundledSymbols.items} rank={rankIndex(bundledUniverse)} watched={watched} source={null} {...h} />
    </TDSMobileAITProvider>,
  );
  return h;
}

describe('AddScreen', () => {
  it('초성으로 찾아 고르고 담아요', () => {
    const h = renderAdd();
    fireEvent.change(screen.getByLabelText('담을 종목 찾기'), { target: { value: 'ㅅㅅㅈㅈ' } });
    fireEvent.click(screen.getByText('삼성전자'));
    fireEvent.click(screen.getByRole('button', { name: '1개 담기' }));
    expect(h.onAdd).toHaveBeenCalledWith([{ symbol: '005930.KS', interval: '1d' }]);
    expect(h.onDone).toHaveBeenCalledWith(1);
  });

  it('봉 단위를 바꾸면 그 봉 단위로 담아요', () => {
    const h = renderAdd();
    fireEvent.change(screen.getByLabelText('담을 종목 찾기'), { target: { value: '005930' } });
    fireEvent.click(screen.getByText('삼성전자'));
    fireEvent.click(screen.getByText('주봉'));
    fireEvent.click(screen.getByRole('button', { name: '1개 담기' }));
    expect(h.onAdd).toHaveBeenCalledWith([{ symbol: '005930.KS', interval: '1wk' }]);
  });

  it('이미 같은 봉 단위로 담은 종목은 담음', () => {
    renderAdd([{ id: '005930.KS|1d', symbol: '005930.KS', interval: '1d', addedAt: 0 }]);
    fireEvent.change(screen.getByLabelText('담을 종목 찾기'), { target: { value: '삼성전자' } });
    expect(screen.getByText('담음')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '담을 종목 고르기' })).toBeDisabled();
  });

  it('분류를 바꾸면 그 분류만', () => {
    renderAdd();
    fireEvent.click(screen.getByText('코인'));
    expect(screen.getByText('비트코인')).toBeInTheDocument();
    expect(screen.queryByText('삼성전자')).not.toBeInTheDocument();
  });
});
