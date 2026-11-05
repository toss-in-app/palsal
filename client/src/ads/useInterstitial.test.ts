import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ad = vi.hoisted(() => ({
  supported: true,
  load: vi.fn<(id: string) => Promise<boolean>>(),
  show: vi.fn<(id: string) => Promise<{ shown: boolean; rewarded: boolean }>>(),
}));
vi.mock('./fullScreen', () => ({
  fullScreenAdSupported: () => ad.supported,
  loadAd: (id: string) => ad.load(id),
  showAd: (id: string) => ad.show(id),
}));

import { useInterstitial } from './useInterstitial';

describe('useInterstitial (전면: 미리 불러오고, 준비된 것만 보여줘요)', () => {
  afterEach(() => {
    ad.supported = true;
    ad.load.mockReset();
    ad.show.mockReset();
    vi.unstubAllEnvs();
  });

  it('스위치 off(VITE_FULL_SCREEN_ADS): 불러오지 않고 upcoming 은 false, show 는 skipped', async () => {
    vi.stubEnv('VITE_FULL_SCREEN_ADS', 'off');
    const { result } = renderHook(() => useInterstitial('g', true));
    await act(async () => {});
    expect(ad.load).not.toHaveBeenCalled();
    expect(result.current.upcoming).toBe(false);
    expect(await result.current.show()).toBe('skipped');
    expect(ad.show).not.toHaveBeenCalled();
  });

  it('조건이 맞으면 미리 불러오고, 준비됐을 때만 보여줘요. 보여준 뒤엔 다시 불러오지 않아요', async () => {
    ad.load.mockResolvedValue(true);
    ad.show.mockResolvedValue({ shown: true, rewarded: false });
    const { result, rerender } = renderHook(({ eligible }) => useInterstitial('g', eligible), { initialProps: { eligible: false } });
    expect(ad.load).not.toHaveBeenCalled();
    expect(await result.current.show()).toBe('skipped');
    rerender({ eligible: true });
    await act(async () => {});
    expect(ad.load).toHaveBeenCalledWith('g');
    expect(await result.current.show()).toBe('shown');
    expect(ad.show).toHaveBeenCalledTimes(1);
    expect(await result.current.show()).toBe('skipped');
    expect(ad.load).toHaveBeenCalledTimes(1);
  });

  it('불러오기 실패는 2번까지만 다시 시도하고, 띄우다 실패하면 failed', async () => {
    ad.load.mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValue(true);
    ad.show.mockResolvedValue({ shown: false, rewarded: false });
    const { result, rerender } = renderHook(({ eligible }) => useInterstitial('g', eligible), { initialProps: { eligible: true } });
    await act(async () => {});
    expect(await result.current.show()).toBe('skipped');
    rerender({ eligible: false });
    rerender({ eligible: true });
    await act(async () => {});
    expect(ad.load).toHaveBeenCalledTimes(2);
    expect(await result.current.show()).toBe('failed');
    rerender({ eligible: false });
    rerender({ eligible: true });
    await act(async () => {});
    expect(ad.load).toHaveBeenCalledTimes(2);
  });

  it('upcoming: 차례면 불러오는 중에도 true, 한 번 보여준 뒤·실패·미지원이면 false', async () => {
    let finishLoad: (ok: boolean) => void = () => {};
    ad.load.mockImplementation(() => new Promise<boolean>((resolve) => (finishLoad = resolve)));
    ad.show.mockResolvedValue({ shown: true, rewarded: false });
    const { result, rerender } = renderHook(({ eligible }) => useInterstitial('g', eligible), { initialProps: { eligible: false } });
    expect(result.current.upcoming).toBe(false);
    rerender({ eligible: true });
    expect(result.current.upcoming).toBe(true);
    await act(async () => finishLoad(true));
    await act(async () => {
      expect(await result.current.show()).toBe('shown');
    });
    expect(result.current.upcoming).toBe(false);
    ad.supported = false;
    const unsupported = renderHook(() => useInterstitial('g', true));
    expect(unsupported.result.current.upcoming).toBe(false);
    expect(await unsupported.result.current.show()).toBe('skipped');
  });
});
