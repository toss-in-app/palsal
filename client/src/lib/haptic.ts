import { generateHapticFeedback } from '@apps-in-toss/web-framework';

export type Haptic = 'tickWeak' | 'tap' | 'tickMedium' | 'softMedium' | 'basicWeak' | 'basicMedium' | 'success' | 'error';

/**
 * 진동(SDK generateHapticFeedback) — 길게 눌러 편집 · 차트 값 보기 · 담기 · 탭 바꾸기에만 짧게.
 * 토스앱 밖(브라우저 · 테스트)이나 못 쓰는 기기에선 조용히 넘어가요. 화면 흐름을 막지 않게 기다리지 않아요.
 */
export function haptic(type: Haptic): void {
  try {
    void Promise.resolve(generateHapticFeedback({ type })).catch(() => {
      /* 지원 안 함 */
    });
  } catch {
    /* 브릿지 없음 */
  }
}
