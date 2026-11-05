import { Device } from '@apps-in-toss/web-framework';

import { withTimeout } from './async';

const BRIDGE_TIMEOUT_MS = 3000;

/**
 * 이용약관·개인정보처리방침 같은 법적 고지 페이지를 열어요(외부 링크 예외 항목 — 콘솔에 등록하는 URL).
 * 토스앱에서는 `Device.openURL`, 브라우저에서는 새 탭.
 */
export async function openUrl(url: string): Promise<void> {
  try {
    await withTimeout(Device.openURL(url), BRIDGE_TIMEOUT_MS);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}
