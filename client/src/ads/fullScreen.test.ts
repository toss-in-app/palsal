import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = { onEvent: (event: { type: string; data?: unknown }) => void; onError: (error: Error) => void };
const loads: Handler[] = [];
const shows: Handler[] = [];

// 브릿지를 직접 흉내 내서 이벤트 순서를 제어해요 (Devtools mock 은 리워드를 안 줘요).
vi.mock('@apps-in-toss/web-framework', () => ({
  loadFullScreenAd: Object.assign(
    (params: Handler) => {
      loads.push(params);
      return () => {};
    },
    { isSupported: () => true },
  ),
  showFullScreenAd: Object.assign(
    (params: Handler) => {
      shows.push(params);
      return () => {};
    },
    { isSupported: () => true },
  ),
}));

import { fullScreenAdSupported, loadAd, resetFullScreenAdCacheForTests, showAd } from './fullScreen';

describe('fullScreen ads', () => {
  beforeEach(() => {
    loads.length = 0;
    shows.length = 0;
    resetFullScreenAdCacheForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('지원 여부를 캐시하고, loaded 면 true · 에러면 false · 시간 초과면 false', async () => {
    expect(fullScreenAdSupported()).toBe(true);

    const ok = loadAd('g');
    loads[0].onEvent({ type: 'loaded' });
    await expect(ok).resolves.toBe(true);

    const bad = loadAd('g');
    loads[1].onError(new Error('no fill'));
    await expect(bad).resolves.toBe(false);

    const slow = loadAd('g');
    await vi.advanceTimersByTimeAsync(30_001);
    await expect(slow).resolves.toBe(false);
  });

  it('show → dismissed 는 shown, userEarnedReward 가 있어야 rewarded', async () => {
    const plain = showAd('g');
    shows[0].onEvent({ type: 'requested' });
    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'dismissed' });
    await expect(plain).resolves.toEqual({ shown: true, rewarded: false });

    const reward = showAd('g');
    shows[1].onEvent({ type: 'show' });
    shows[1].onEvent({ type: 'userEarnedReward', data: { unitType: 'tomorrow', unitAmount: 1 } });
    shows[1].onEvent({ type: 'dismissed' });
    await expect(reward).resolves.toEqual({ shown: true, rewarded: true });
  });

  it('failedToShow · onError · 8초 안에 안 뜨면 shown=false', async () => {
    const failed = showAd('g');
    shows[0].onEvent({ type: 'failedToShow' });
    await expect(failed).resolves.toEqual({ shown: false, rewarded: false });

    const errored = showAd('g');
    shows[1].onError(new Error('not loaded'));
    await expect(errored).resolves.toEqual({ shown: false, rewarded: false });

    const silent = showAd('g');
    shows[2].onEvent({ type: 'requested' });
    await vi.advanceTimersByTimeAsync(8_001);
    await expect(silent).resolves.toEqual({ shown: false, rewarded: false });
  });

  it('닫힘 이벤트가 안 와도 화면이 가려졌다 돌아오면 닫힌 것으로 봐요', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    const pending = showAd('g');
    shows[0].onEvent({ type: 'impression' });
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(600);
    await expect(pending).resolves.toEqual({ shown: true, rewarded: false });
    visibility.mockRestore();
  });
});
