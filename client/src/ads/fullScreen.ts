/**
 * 전면·리워드 광고 브릿지(loadFullScreenAd / showFullScreenAd)를 약속(Promise)으로 감싼 것 (mandalartplan 과 같은 모듈).
 * 두 유형은 같은 API 를 쓰고 광고 그룹 ID 로 유형이 정해져요. 순서는 반드시 load → (loaded 이벤트) → show → (다음 load).
 * 실패·미지원·시간 초과는 모두 "광고 없음" 으로 돌려주고 던지지 않아요 — 호출한 쪽은 광고 없이 흐름을 이어가요.
 */
import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

/** 토스 애즈는 1~2초, 애드몹은 5~20초(최대 60초)까지 걸릴 수 있어요(공식 FAQ). 그 안에 안 오면 포기해요. */
const LOAD_TIMEOUT_MS = 30_000;
/** show 를 불렀는데 이만큼 지나도 뜨지 않으면 실패로 봐요 */
const SHOW_START_TIMEOUT_MS = 8_000;
/** 떠 있는 광고가 닫힘 이벤트 없이 이만큼 지나면 닫힌 것으로 봐요(안전장치) */
const DISMISS_FALLBACK_MS = 120_000;

let supportedCache: boolean | null = null;

/** 이 토스앱 버전이 통합 전면 광고를 지원하는지. 브릿지가 없는 브라우저에서는 false. */
export function fullScreenAdSupported(): boolean {
  if (supportedCache === null) {
    try {
      supportedCache = loadFullScreenAd.isSupported() && showFullScreenAd.isSupported();
    } catch {
      supportedCache = false;
    }
  }
  return supportedCache;
}

/** 광고를 미리 불러와요. loaded 가 오면 true, 실패·시간 초과면 false. */
export function loadAd(adGroupId: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let unregister: () => void = () => {};
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        unregister();
      } catch {
        /* 무시 */
      }
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
    try {
      unregister = loadFullScreenAd({
        options: { adGroupId },
        onEvent: (event) => {
          if (event.type === 'loaded') finish(true);
        },
        onError: () => finish(false),
      });
    } catch {
      finish(false);
    }
  });
}

export interface ShowAdResult {
  /** 광고가 화면에 떴는지 (미로딩·표시 실패면 false) */
  shown: boolean;
  /** 리워드 광고를 끝까지 봐서 userEarnedReward 가 왔는지. 보상은 이 값이 true 일 때만 줘요 */
  rewarded: boolean;
}

/** 미리 불러온 광고를 보여주고 닫힐 때까지 기다려요. */
export function showAd(adGroupId: string): Promise<ShowAdResult> {
  return new Promise((resolve) => {
    let settled = false;
    let shown = false;
    let rewarded = false;
    let wasHidden = false;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    let unregister: () => void = () => {};

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(startTimer);
      if (fallback) clearTimeout(fallback);
      document.removeEventListener('visibilitychange', onVisibility);
      try {
        unregister();
      } catch {
        /* 무시 */
      }
      resolve({ shown, rewarded });
    };
    /** 닫힘(dismissed) 이벤트가 안 오는 버전(Android 토스앱 5.255.0, 공식 FAQ)의 대비: 광고에 가려졌다가 다시 보이면 닫힌 것으로 */
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = true;
        return;
      }
      if (shown && wasHidden) setTimeout(finish, 500);
    };
    const markShown = () => {
      if (shown) return;
      shown = true;
      clearTimeout(startTimer);
      fallback = setTimeout(finish, DISMISS_FALLBACK_MS);
    };
    const startTimer = setTimeout(() => {
      if (!shown) finish();
    }, SHOW_START_TIMEOUT_MS);
    document.addEventListener('visibilitychange', onVisibility);

    try {
      unregister = showFullScreenAd({
        options: { adGroupId },
        onEvent: (event) => {
          switch (event.type) {
            case 'show':
            case 'impression':
            case 'clicked':
              markShown();
              break;
            case 'userEarnedReward':
              markShown();
              rewarded = true;
              break;
            case 'dismissed':
            case 'failedToShow':
              finish();
              break;
            default:
              break; // requested: 요청만 성공, 아직 안 뜸
          }
        },
        onError: () => finish(),
      });
    } catch {
      finish();
    }
  });
}

/** 테스트용: 지원 여부 캐시를 비워요 */
export function resetFullScreenAdCacheForTests(): void {
  supportedCache = null;
}
