import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 콘솔 appName(4단계 등록 때 확정 — 시도 순서 palsal → pal-sal → palkkeol-salkkeol). intoss://palsal 로 열려요. 등록 후에는 바꿀 수 없어요.
  // 바뀌면 python3 scripts/rename-app.py palsal <새 이름> (~/Desktop/toss 에서).
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
