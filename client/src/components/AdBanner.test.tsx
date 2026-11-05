import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetBannerSdkForTests } from '../ads/banner';
import { AdBanner } from './AdBanner';

/* 6단계 광고 흐름 모킹: 배너가 안 뜨는 모든 경우에 자리를 숨기고, 떠나면 destroy (TossAds 를 흉내 내요) */
type Callbacks = { onAdRendered?: () => void; onNoFill?: () => void; onAdFailedToRender?: () => void };
const sdk = vi.hoisted(() => ({
  supported: true,
  initOk: true,
  throwOnAttach: false,
  attachCalls: [] as { id: string; callbacks: Callbacks }[],
  destroyed: 0,
}));

vi.mock('@apps-in-toss/web-framework', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apps-in-toss/web-framework')>();
  const initialize = Object.assign(
    (opts: { callbacks: { onInitialized: () => void; onInitializationFailed: () => void } }) => {
      if (sdk.initOk) opts.callbacks.onInitialized();
      else opts.callbacks.onInitializationFailed();
    },
    { isSupported: () => sdk.supported },
  );
  const attachBanner = Object.assign(
    (id: string, _el: HTMLElement, opts: { callbacks: Callbacks }) => {
      if (sdk.throwOnAttach) throw new Error('attach');
      sdk.attachCalls.push({ id, callbacks: opts.callbacks });
      return { destroy: () => (sdk.destroyed += 1) };
    },
    { isSupported: () => sdk.supported },
  );
  return { ...actual, TossAds: { ...actual.TossAds, initialize, attachBanner } };
});

async function mount() {
  const onResult = vi.fn();
  const view = render(<AdBanner adGroupId="ait.v2.live.home" onResult={onResult} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { view, onResult, el: screen.getByTestId('ad-banner') };
}

describe('AdBanner — 광고 흐름', () => {
  beforeEach(() => {
    resetBannerSdkForTests();
    Object.assign(sdk, { supported: true, initOk: true, throwOnAttach: false, attachCalls: [], destroyed: 0 });
  });

  it('배너를 지원하지 않는 곳(일반 브라우저 · 낮은 토스앱)이면 붙이지 않고 자리를 숨겨요', async () => {
    sdk.supported = false;
    const { el } = await mount();
    expect(sdk.attachCalls).toHaveLength(0);
    expect(el).toHaveStyle({ display: 'none' });
  });

  it('초기화가 실패하거나 붙이다 오류가 나면 자리를 숨겨요', async () => {
    sdk.initOk = false;
    const first = await mount();
    expect(first.el).toHaveStyle({ display: 'none' });
    first.view.unmount();
    resetBannerSdkForTests();
    Object.assign(sdk, { initOk: true, throwOnAttach: true });
    expect((await mount()).el).toHaveStyle({ display: 'none' });
  });

  it('광고가 없거나(nofill) 그리기에 실패하면 자리를 숨기고 결과를 알려요', async () => {
    const { el, onResult } = await mount();
    expect(sdk.attachCalls).toEqual([expect.objectContaining({ id: 'ait.v2.live.home' })]);
    act(() => sdk.attachCalls[0].callbacks.onNoFill?.());
    expect(el).toHaveStyle({ display: 'none' });
    expect(onResult).toHaveBeenCalledWith('nofill');
    act(() => sdk.attachCalls[0].callbacks.onAdFailedToRender?.());
    expect(onResult).toHaveBeenCalledWith('failed');
  });

  it('그려지면 보이고, 화면을 떠나면 destroy 해요', async () => {
    const { el, onResult, view } = await mount();
    act(() => sdk.attachCalls[0].callbacks.onAdRendered?.());
    expect(el).toHaveStyle({ display: 'block' });
    expect(onResult).toHaveBeenCalledWith('rendered');
    view.unmount();
    expect(sdk.destroyed).toBe(1);
  });
});
