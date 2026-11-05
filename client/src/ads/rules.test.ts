import { describe, expect, it } from 'vitest';

import { defaultSettings } from '../state/settings';
import { AD_GROUPS, TEST_AD_GROUPS } from './config';
import { interstitialEligible } from './rules';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-05T03:00:00Z'); // 12:00 KST

describe('interstitialEligible (하루 1회 · 처음 연 날 없음)', () => {
  it('처음 연 날은 없어요', () => {
    expect(interstitialEligible(defaultSettings(NOW), '2026-11-05')).toBe(false);
  });

  it('다음 날부터 하루 한 번', () => {
    const s = defaultSettings(NOW - DAY);
    expect(interstitialEligible(s, '2026-11-05')).toBe(true);
    expect(interstitialEligible({ ...s, ads: { lastInterstitialDate: '2026-11-05' } }, '2026-11-05')).toBe(false);
    expect(interstitialEligible({ ...s, ads: { lastInterstitialDate: '2026-11-04' } }, '2026-11-05')).toBe(true);
  });
});

describe('광고 그룹(개발·테스트는 테스트 ID)', () => {
  it('출시 빌드가 아니면 테스트 ID 로 채워요', () => {
    expect(TEST_AD_GROUPS).not.toBeNull();
    expect(AD_GROUPS.interstitialStock).toBe('ait-ad-test-interstitial-id');
    expect(AD_GROUPS.bannerHome).toBe('ait-ad-test-banner-id');
    expect(AD_GROUPS.bannerMarket).toBe('ait-ad-test-banner-id');
  });
});
