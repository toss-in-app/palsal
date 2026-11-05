import { afterEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => vi.fn<(p: unknown) => Promise<void>>());
vi.mock('@apps-in-toss/web-framework', () => ({ Analytics: { log } }));

import { logEvent, logEventOnce, resetAnalyticsForTests } from './analytics';

describe('analytics', () => {
  afterEach(() => {
    log.mockReset();
    resetAnalyticsForTests();
  });

  it('값은 문자열로, null·undefined 는 빼고, 화면 이벤트는 screen 으로', () => {
    log.mockResolvedValue();
    logEvent('stock_view', { symbol: 'NVDA', market: 'US', interval: '1d', from: 'card', nothing: null, missing: undefined });
    expect(log).toHaveBeenCalledWith({ log_name: 'stock_view', log_type: 'screen', params: { symbol: 'NVDA', market: 'US', interval: '1d', from: 'card' } });
    logEvent('watch_add', { n: 2, count: 6, interval: '1d' });
    expect(log).toHaveBeenLastCalledWith({ log_name: 'watch_add', log_type: 'event', params: { n: '2', count: '6', interval: '1d' } });
  });

  it('브릿지가 던지거나 거부해도 조용히', async () => {
    log.mockImplementation(() => {
      throw new Error('no bridge');
    });
    expect(() => logEvent('home_view', { count: 0 })).not.toThrow();
    log.mockRejectedValue(new Error('offline'));
    expect(() => logEvent('home_view', { count: 0 })).not.toThrow();
    await Promise.resolve();
  });

  it('세션당 1회', () => {
    log.mockResolvedValue();
    logEventOnce('home_view', { count: 1, from: 'direct' });
    logEventOnce('home_view', { count: 1, from: 'direct' });
    expect(log).toHaveBeenCalledTimes(1);
    // 구분 키가 다르면 따로(알림 받기 카드 · 설정 줄)
    logEventOnce('notification_prompt_view', { where: 'changes' }, 'changes');
    logEventOnce('notification_prompt_view', { where: 'settings' }, 'settings');
    logEventOnce('notification_prompt_view', { where: 'settings' }, 'settings');
    expect(log).toHaveBeenCalledTimes(3);
  });
});
