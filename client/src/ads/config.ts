/**
 * 광고 그룹 ID (계약 contract/events.md '광고 그룹'). 이 앱은 **배너만** 써요 — 전면·리워드 없음(2026-11-05 사용자 결정 '전면광고 띄우지말고 배너만').
 * 라이브 ID 는 콘솔 인앱 광고에서 만든 광고 그룹의 groupId → `.env.production` 의 VITE_AD_GROUP_* (출시 빌드 `vite build` 가 읽어요).
 *
 * 출시 빌드(MODE=production)에는 테스트 ID 문자열이 한 글자도 들어가면 안 돼요 — 콘솔이 번들을 정적으로 검사해
 * 'ait-ad-test-…' 가 있으면 검토를 자동 반려해요(mandalartplan 2026-10-19 반려). 그래서 테스트 ID 는 production 이 아닌 모드
 * (개발 서버·vitest·`npm run build:test-ads`)에서만 코드에 남고, 출시 빌드에서는 아래 상수가 null 로 접혀 번들에서 사라져요.
 * `npm run build` 뒤 `scripts/check-release-bundle.mjs` 가 dist 를 다시 검사해요.
 * 개발·QR 테스트는 테스트 ID 로만 — 라이브 ID 로 테스트하면 정책 위반이에요.
 */
const IS_RELEASE_BUILD = import.meta.env.MODE === 'production';

/** 앱인토스 공식 테스트 배너 광고 그룹 ID. 출시 빌드에서는 null */
export const TEST_BANNER_GROUP: string | null = IS_RELEASE_BUILD ? null : 'ait-ad-test-banner-id';

function pick(value: string | undefined, fallback: string | null): string {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : (fallback ?? '');
}

export const AD_GROUPS = {
  /** `banner-home`: 내 종목 둘째 카드 뒤부터 카드 두 장마다(내려가며 붙는 카드에도 계속) */
  bannerHome: pick(import.meta.env.VITE_AD_GROUP_BANNER_HOME, TEST_BANNER_GROUP),
  /** `banner-market`: 시장 '지금 RSI 30 아래인 큰 종목' 뒤 (배너 1개) */
  bannerMarket: pick(import.meta.env.VITE_AD_GROUP_BANNER_MARKET, TEST_BANNER_GROUP),
} as const;
