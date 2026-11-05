import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { bundledContent } from '../content';
import { SettingsScreen } from './SettingsScreen';

function renderSettings(autoRefresh = true) {
  const h = { onAutoRefresh: vi.fn(), onOpenTerms: vi.fn(), onOpenPrivacy: vi.fn() };
  render(
    <TDSMobileAITProvider brandPrimaryColor="#3182F6">
      <SettingsScreen content={bundledContent} autoRefresh={autoRefresh} {...h} />
    </TDSMobileAITProvider>,
  );
  return h;
}

describe('SettingsScreen', () => {
  it('자동 새로고침 스위치', () => {
    const h = renderSettings(true);
    fireEvent.click(screen.getByRole('switch', { name: '보고 있을 때 5분마다 새로고침' }));
    expect(h.onAutoRefresh).toHaveBeenCalledWith(false);
  });

  it('도움말은 누른 것만 펼쳐요', () => {
    renderSettings();
    expect(screen.queryByText(bundledContent.fearGreed.body)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(bundledContent.fearGreed.title));
    expect(screen.getByText(bundledContent.fearGreed.body)).toBeInTheDocument();
    fireEvent.click(screen.getByText('자주 묻는 질문'));
    expect(screen.queryByText(bundledContent.fearGreed.body)).not.toBeInTheDocument();
    expect(screen.getByText(bundledContent.faq[0].q)).toBeInTheDocument();
    fireEvent.click(screen.getByText('RSI 구간과 표시 읽는 법'));
    expect(screen.getByText(bundledContent.zones[0].body)).toBeInTheDocument();
  });

  it('약관·처리방침 · 시세 출처 · 면책', () => {
    const h = renderSettings();
    fireEvent.click(screen.getByText('이용약관'));
    fireEvent.click(screen.getByText('개인정보처리방침'));
    expect(h.onOpenTerms).toHaveBeenCalled();
    expect(h.onOpenPrivacy).toHaveBeenCalled();
    expect(screen.getByText('코인 공포탐욕 · alternative.me')).toBeInTheDocument();
    expect(screen.getByText(bundledContent.disclaimer)).toBeInTheDocument();
  });
});
