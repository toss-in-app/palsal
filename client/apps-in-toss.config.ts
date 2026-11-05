import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 콘솔 appName — 2026-11-05 등록 확정(miniAppId 97559). intoss://palsal 로 열려요. 바꿀 수 없어요.
  appName: 'palsal',
  brand: {
    // 로고 T5 의 '팔껄' 파랑. 오름 빨강(#F04452)·내림 파랑과 같은 계열이라 버튼에만 써요.
    primaryColor: '#3182F6',
  },
  navigationBar: {
    withBackButton: true,
    withHomeButton: false,
    theme: 'light',
  },
  webView: {
    pullToRefreshEnabled: false,
    bounces: false,
  },
  permissions: [],
  webBundleDir: 'dist',
});
