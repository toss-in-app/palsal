/**
 * 알림 동의 (Notification.requestAgreement) — 콘솔 '푸시알림' 기능성 탭의 정기 발송 템플릿 `palsal-daily`(매일 10:00 'RSI 확인')에
 * 연결된 알림 동의문을 띄워요(계약 events.md '알림'). mandalartplan 과 같은 방식.
 * 설계(흐름 문서 '알림 동의 흐름'): 진입·뒤로가기 때는 묻지 않고, 최근 바뀐 것 카드·설정 줄을 사용자가 누른 뒤에만.
 * SDK 로는 동의를 끌 수 없어요 — 끄기는 토스 앱의 알림 설정에서(그래서 스위치가 아니라 상태 글자가 있는 줄).
 */
import { Notification } from '@apps-in-toss/web-framework';

/**
 * 템플릿 코드(= 알림 동의문이 연결된 발송 코드, `palsal-` 로 시작). 콘솔에서 만들면 `.env` 의 VITE_NOTIFICATION_TEMPLATE_CODE 에 넣어요.
 * 개발 빌드에서만 계약의 코드로 대신해요. 출시 번들에 값이 없으면 알림 줄은 '준비 중'.
 */
export const NOTIFICATION_TEMPLATE_CODE: string = (import.meta.env.VITE_NOTIFICATION_TEMPLATE_CODE ?? '').trim() || (import.meta.env.DEV ? 'palsal-daily' : '');

/** 알림 동의를 쓸 수 있는지: 템플릿 코드가 있고 토스앱 버전이 지원할 때 */
export function notificationAvailable(): boolean {
  if (!NOTIFICATION_TEMPLATE_CODE) return false;
  try {
    return Notification.requestAgreement.isSupported();
  } catch {
    return false;
  }
}

export type AgreementResult = 'agreed' | 'alreadyAgreed' | 'declined' | 'unsupported' | 'failed';

/** 사용자가 동의 화면에서 고르는 시간. 그 안에 결과가 없으면 실패로 봐요 */
const AGREEMENT_TIMEOUT_MS = 120_000;

/** 알림 동의 화면을 띄우고 결과를 기다려요. 던지지 않아요. */
export function requestNotificationAgreement(templateCode: string = NOTIFICATION_TEMPLATE_CODE): Promise<AgreementResult> {
  return new Promise((resolve) => {
    if (!templateCode) {
      resolve('unsupported');
      return;
    }
    let settled = false;
    // 실기기에서 반환값이 함수가 아닌 경우가 있어요(mandalartplan Devtools 메모) → 함수일 때만 해제해요
    let cleanup: unknown = null;
    const finish = (result: AgreementResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (typeof cleanup === 'function') {
        try {
          (cleanup as () => void)();
        } catch {
          /* 무시 */
        }
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish('failed'), AGREEMENT_TIMEOUT_MS);
    try {
      if (!Notification.requestAgreement.isSupported()) {
        finish('unsupported');
        return;
      }
      cleanup = Notification.requestAgreement({
        options: { templateCode },
        onEvent: (result) => {
          if (result.type === 'newAgreement') finish('agreed');
          else if (result.type === 'alreadyAgreed') finish('alreadyAgreed');
          else if (result.type === 'agreementRejected') finish('declined');
          else finish('failed');
        },
        onError: (error: unknown) => {
          const code = (error as { code?: unknown } | null)?.code;
          finish(code === 'UNSUPPORTED_APP_VERSION' ? 'unsupported' : 'failed');
        },
      });
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      finish(code === 'UNSUPPORTED_APP_VERSION' ? 'unsupported' : 'failed');
    }
  });
}

/** 결과 → 토스트 문구(흐름 문서 '알림 동의 흐름') */
export const AGREEMENT_TOAST: Record<AgreementResult, string> = {
  agreed: '매일 오전 10시에 알려 드릴게요',
  alreadyAgreed: '이미 알림을 받고 있어요',
  declined: '알림을 받지 않아요. 설정에서 다시 켤 수 있어요',
  unsupported: '알림은 토스앱을 업데이트하면 설정할 수 있어요',
  failed: '알림을 설정하지 못했어요. 잠시 뒤에 다시 해 주세요',
};
