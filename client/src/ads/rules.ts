import { kstDateKey } from '../lib/date';
import type { Settings } from '../state/settings';

export const AD_MESSAGES = {
  /** 내 종목 맨 위 · 최근 바뀐 것 위, 전면 광고 차례인 날만(노출 정책 UX 원칙 2 — 사전 안내) */
  interstitialNotice: '오늘 처음 종목을 열 때 광고가 한 번 나와요. 그 뒤로는 광고 없이 볼 수 있어요.',
} as const;

/**
 * 전면 광고를 보여줄 수 있는 조건(계약 interstitial-stock): 오늘 아직 안 보여줌 · 처음 연 날이 아님(firstOpenAt 의 한국 날짜 ≠ 오늘).
 * 시장 탭·딥링크로 여는 자세히에는 없어요 — 전면은 내 종목 카드·변화 배너·최근 바뀐 것에서 누를 때만 띄우니 자연히 그래요.
 * 설정을 읽기 전 기본값은 firstOpenAt = 지금이라 처음 연 날로 보여 광고가 나오지 않아요.
 */
export function interstitialEligible(settings: Settings, today: string): boolean {
  if (settings.ads.lastInterstitialDate === today) return false;
  return kstDateKey(new Date(settings.firstOpenAt)) !== today;
}
