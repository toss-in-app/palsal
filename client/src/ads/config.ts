/**
 * 광고 그룹 ID (계약 contract/events.md '광고 그룹'). byeol-today·mandalartplan 과 같은 규칙이에요.
 * 라이브 ID 는 콘솔 인앱 광고에서 만든 광고 그룹의 groupId → `.env.production` 의 VITE_AD_GROUP_* (출시 빌드 `vite build` 가 읽어요).
 *
 * 출시 빌드(MODE=production)에는 테스트 ID 문자열이 한 글자도 들어가면 안 돼요 — 콘솔이 번들을 정적으로 검사해
 * 'ait-ad-test-…' 가 있으면 검토를 자동 반려해요(mandalartplan 2026-10-19 반려). 그래서 테스트 ID 는 production 이 아닌 모드
 * (개발 서버·vitest·`npm run build:test-ads`)에서만 코드에 남고, 출시 빌드에서는 아래 상수가 null 로 접혀 번들에서 사라져요.
 * `npm run build` 뒤 `scripts/check-release-bundle.mjs` 가 dist 를 다시 검사해요.
 * 개발·QR 테스트는 테스트 ID 로만 — 라이브 ID 로 테스트하면 정책 위반이에요.
 */
const IS_RELEASE_BUILD = import.meta.env.MODE === 'production';

/** 앱인토스 공식 테스트 광고 그룹 ID. 출시 빌드에서는 null. 리워드는 1.0 에 없어요 */
export const TEST_AD_GROUPS: { interstitial: string; banner: string } | null = IS_RELEASE_BUILD
  ? null
  : {
      interstitial: 'ait-ad-test-interstitial-id',
      banner: 'ait-ad-test-banner-id',
    };

function pick(value: string | undefined, fallback: string | undefined): string {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : (fallback ?? '');
}

export const AD_GROUPS = {
  /** `interstitial-stock`: 내 종목 카드 · 변화 배너 · 최근 바뀐 것 → 종목 자세히 (전면, 하루 1회, 처음 연 날 없음, 시장·딥링크 없음) */
  interstitialStock: pick(import.meta.env.VITE_AD_GROUP_INTERSTITIAL_STOCK, TEST_AD_GROUPS?.interstitial),
  /** `banner-home`: 내 종목 둘째 카드 뒤 (배너 1개) */
  bannerHome: pick(import.meta.env.VITE_AD_GROUP_BANNER_HOME, TEST_AD_GROUPS?.banner),
  /** `banner-market`: 시장 '지금 RSI 30 아래인 큰 종목' 뒤 (배너 1개) */
  bannerMarket: pick(import.meta.env.VITE_AD_GROUP_BANNER_MARKET, TEST_AD_GROUPS?.banner),
} as const;

/**
 * 전면 광고를 띄울지 — `.env` 의 `VITE_FULL_SCREEN_ADS` 가 'on' 일 때만(byeol-today 와 같은 스위치).
 * off 면 전면은 부르지 않고 AD 표시·사전 안내도 없어요. 배너는 그대로.
 * 배경: mandalartplan 3.0.1(2026-10-22) — 안드로이드 토스앱이 광고 이벤트를 늦게/안 보내던 동안 전면을 끈 선례. 출시 때 on/off 는 사용자 결정.
 */
export function fullScreenAdsEnabled(): boolean {
  return import.meta.env.VITE_FULL_SCREEN_ADS === 'on';
}
