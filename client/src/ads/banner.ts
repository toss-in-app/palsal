/**
 * 토스 배너 SDK(TossAds) 초기화를 앱에서 한 번만. 배너 부착은 components/AdBanner.tsx. (mandalartplan 과 같은 모듈)
 */
import { TossAds } from '@apps-in-toss/web-framework';

const INIT_TIMEOUT_MS = 10_000;
let initPromise: Promise<boolean> | null = null;

/** 토스앱 5.241.0 이상. 브릿지가 없는 브라우저에서는 false. */
export function bannerSupported(): boolean {
  try {
    return TossAds.initialize.isSupported() && TossAds.attachBanner.isSupported();
  } catch {
    return false;
  }
}

/** 초기화(멱등). 미지원·실패·시간 초과면 false 를 돌려주고, 다음 호출 때 다시 시도해요. */
export function ensureBannerSdk(): Promise<boolean> {
  if (!initPromise) {
    initPromise = new Promise<boolean>((resolve) => {
      if (!bannerSupported()) {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), INIT_TIMEOUT_MS);
      try {
        TossAds.initialize({
          callbacks: {
            onInitialized: () => finish(true),
            onInitializationFailed: () => finish(false),
          },
        });
      } catch {
        finish(false);
      }
    }).then((ok) => {
      if (!ok) initPromise = null;
      return ok;
    });
  }
  return initPromise;
}

/** 테스트용 */
export function resetBannerSdkForTests(): void {
  initPromise = null;
}
