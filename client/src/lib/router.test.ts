import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { haptic } from './haptic';
import { lastNavigation, navigate, parseRoute, resolveHash, routeFromSchemeUrl, routeToHash, useRoute, type Route } from './router';

describe('parseRoute · routeToHash', () => {
  const routes: Route[] = [
    { name: 'home' },
    { name: 'changes' },
    { name: 'add' },
    { name: 'market' },
    { name: 'settings' },
    { name: 'stock', symbol: '005930.KS', interval: '1d' },
    { name: 'stock', symbol: 'AAPL', interval: '1wk' },
    { name: 'stock', symbol: 'BTC-USD', interval: '1mo' },
    { name: 'stock', symbol: 'USDKRW=X', interval: '1wk' },
    { name: 'stock', symbol: '^KS11', interval: '1d' },
  ];

  it.each(routes.map((r) => [routeToHash(r), r] as const))('%s 를 오가도 같은 화면', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it('봉 단위가 없으면 일봉', () => {
    expect(parseRoute('#/stock/NVDA')).toEqual({ name: 'stock', symbol: 'NVDA', interval: '1d' });
  });

  it('모르는 경로·틀린 심볼·봉 단위는 홈으로', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'home' });
    expect(parseRoute('#/stock/')).toEqual({ name: 'home' });
    expect(parseRoute('#/stock/aapl')).toEqual({ name: 'home' });
    expect(parseRoute('#/stock/AAPL/5m')).toEqual({ name: 'home' });
    expect(parseRoute('#/stock/AAPL/1d/extra')).toEqual({ name: 'home' });
    expect(parseRoute('#/stock/%E0%A4%A')).toEqual({ name: 'home' });
    expect(parseRoute('#/stock/A_B')).toEqual({ name: 'home' });
  });
});

describe('routeFromSchemeUrl', () => {
  it('딥링크에서 첫 화면을 골라요', () => {
    expect(routeFromSchemeUrl('intoss://palsal')).toEqual({ name: 'home' });
    expect(routeFromSchemeUrl('intoss://palsal/market')).toEqual({ name: 'market' });
    expect(routeFromSchemeUrl('intoss://palsal/settings?from=push')).toEqual({ name: 'settings' });
    expect(routeFromSchemeUrl('intoss://palsal/changes')).toEqual({ name: 'changes' });
    expect(routeFromSchemeUrl('intoss://palsal/stock/005930.KS?i=1wk')).toEqual({ name: 'stock', symbol: '005930.KS', interval: '1wk' });
    expect(routeFromSchemeUrl('intoss://palsal/stock/%5EKS11')).toEqual({ name: 'stock', symbol: '^KS11', interval: '1d' });
    expect(routeFromSchemeUrl('intoss://palsal/stock/NVDA?i=zz')).toEqual({ name: 'stock', symbol: 'NVDA', interval: '1d' });
    expect(routeFromSchemeUrl('not a url')).toBeNull();
  });
});

describe('resolveHash', () => {
  it('해시가 없으면 바닥 화면(딥링크), 있으면 해시 화면', () => {
    expect(resolveHash('', { name: 'market' })).toEqual({ name: 'market' });
    expect(resolveHash('#/', { name: 'settings' })).toEqual({ name: 'settings' });
    expect(resolveHash('#/add', { name: 'market' })).toEqual({ name: 'add' });
  });
});

describe('화면이 들어오는 방향', () => {
  it('앞으로 가면 push, 토스앱 뒤로가기(popstate)면 pop', () => {
    const { result } = renderHook(() => useRoute());
    act(() => navigate({ name: 'market' }));
    expect(lastNavigation()).toBe('push');
    expect(result.current).toEqual({ name: 'market' });
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(lastNavigation()).toBe('pop');
    act(() => navigate({ name: 'settings' }));
    expect(lastNavigation()).toBe('push');
  });

  it('진동은 토스앱 밖(브릿지 없음)에서 조용히 넘어가요', () => {
    expect(() => haptic('success')).not.toThrow();
  });
});
