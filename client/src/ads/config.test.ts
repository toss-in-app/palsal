import { describe, expect, it } from 'vitest';

import { AD_GROUPS, TEST_BANNER_GROUP } from './config';

describe('광고 그룹(배너만 — 개발·테스트는 테스트 ID)', () => {
  it('출시 빌드가 아니면 테스트 배너 ID 로 채워요', () => {
    expect(TEST_BANNER_GROUP).toBe('ait-ad-test-banner-id');
    expect(AD_GROUPS).toEqual({ bannerHome: 'ait-ad-test-banner-id', bannerMarket: 'ait-ad-test-banner-id' });
  });
});
