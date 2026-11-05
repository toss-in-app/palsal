import { describe, expect, it, vi } from 'vitest';

const requestAgreement = Object.assign(vi.fn(), { isSupported: vi.fn(() => true) });
vi.mock('@apps-in-toss/web-framework', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@apps-in-toss/web-framework')>()),
  Notification: { requestAgreement },
}));

const { requestNotificationAgreement, NOTIFICATION_TEMPLATE_CODE } = await import('./agreement');

type Handlers = { options: { templateCode: string }; onEvent: (r: { type: string }) => void; onError: (e: unknown) => void };

describe('requestNotificationAgreement', () => {
  it('개발 빌드에서는 계약의 템플릿 코드', () => {
    expect(NOTIFICATION_TEMPLATE_CODE).toBe('palsal-daily');
  });

  it.each([
    ['newAgreement', 'agreed'],
    ['alreadyAgreed', 'alreadyAgreed'],
    ['agreementRejected', 'declined'],
  ])('%s → %s', async (type, expected) => {
    requestAgreement.mockImplementationOnce((h: Handlers) => {
      expect(h.options.templateCode).toBe('palsal-daily');
      h.onEvent({ type });
      return () => {};
    });
    expect(await requestNotificationAgreement()).toBe(expected);
  });

  it('토스앱 버전이 낮으면 unsupported, 다른 오류는 failed', async () => {
    requestAgreement.mockImplementationOnce((h: Handlers) => h.onError({ code: 'UNSUPPORTED_APP_VERSION' }));
    expect(await requestNotificationAgreement()).toBe('unsupported');
    requestAgreement.mockImplementationOnce(() => {
      throw new Error('bridge');
    });
    expect(await requestNotificationAgreement()).toBe('failed');
  });

  it('템플릿 코드가 없으면 unsupported', async () => {
    expect(await requestNotificationAgreement('')).toBe('unsupported');
  });
});
