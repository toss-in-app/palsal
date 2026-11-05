import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readJson, writeJson } from '../lib/storage';
import { bundledContent, bundledSymbols, compareContentVersion, symbolIndex } from '.';
import { fetchStatic, liveStatic, loadStatic, resetLiveStatic, STATIC_CACHE_PREFIX } from './live';

const TODAY = '2026-11-06';

function respond(status: number, body?: unknown, etag?: string) {
  return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status, headers: etag ? { ETag: etag } : {} }));
}

const newerSymbols = { ...bundledSymbols, contentVersion: '2099-01-01.1', items: [...bundledSymbols.items, { s: 'PLTR', n: '팔란티어', m: 'US', x: 'NASDAQ' }] };

beforeEach(() => resetLiveStatic());
afterEach(() => vi.unstubAllGlobals());

describe('compareContentVersion', () => {
  it('뒤 번호가 두 자리여도', () => {
    expect(compareContentVersion('2026-11-05.10', '2026-11-05.9')).toBeGreaterThan(0);
    expect(compareContentVersion('2026-11-04.9', '2026-11-05.1')).toBeLessThan(0);
  });
});

describe('fetchStatic', () => {
  it('200 · 304 · 404 · 모양 다름 · 앱 버전보다 높은 minClientVersion', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReturnValueOnce(respond(200, newerSymbols, '"v2"'));
    expect(await fetchStatic('symbols', null, '1.0.0')).toMatchObject({ status: 'ok', etag: '"v2"' });
    fetchMock.mockReturnValueOnce(respond(304));
    expect(await fetchStatic('symbols', '"v2"', '1.0.0')).toEqual({ status: 'notModified' });
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ 'If-None-Match': '"v2"' });
    fetchMock.mockReturnValueOnce(respond(404, { x: 1 }));
    expect(await fetchStatic('content', null, '1.0.0')).toEqual({ status: 'failed', code: '404' });
    fetchMock.mockReturnValueOnce(respond(200, { kind: 'content' }));
    expect(await fetchStatic('content', null, '1.0.0')).toEqual({ status: 'failed', code: 'shape' });
    fetchMock.mockReturnValueOnce(respond(200, { ...bundledContent, minClientVersion: '9.0.0' }));
    expect(await fetchStatic('content', null, '1.0.0')).toEqual({ status: 'failed', code: 'shape' });
  });
});

describe('loadStatic', () => {
  it('새 판을 받아 바꿔 끼우고 기기에 저장, 종목 찾기 목록도 새로', async () => {
    const fetchMock = vi.fn((url: string) => (url.endsWith('/symbols.json') ? respond(200, newerSymbols, '"s2"') : respond(404)));
    vi.stubGlobal('fetch', fetchMock);
    const errors: string[] = [];
    await loadStatic(TODAY, '1.0.0', (name, code) => errors.push(`${name}:${code}`));
    expect(liveStatic.get().remote).toEqual(['symbols']);
    expect(symbolIndex.get('PLTR')?.n).toBe('팔란티어');
    expect(errors.sort()).toEqual(['content:404', 'universe:404']);
    expect(((await readJson(`${STATIC_CACHE_PREFIX}symbols`)) as { fetchedOn: string }).fetchedOn).toBe(TODAY);
  });

  it('오늘 이미 물어봤으면 저장본만 쓰고 다시 묻지 않아요', async () => {
    await writeJson(`${STATIC_CACHE_PREFIX}symbols`, { version: 1, fetchedOn: TODAY, etag: '"s2"', data: newerSymbols });
    const fetchMock = vi.fn((url: string) => (url.endsWith('/symbols.json') ? respond(200, newerSymbols) : respond(304)));
    vi.stubGlobal('fetch', fetchMock);
    await loadStatic(TODAY, '1.0.0');
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.endsWith('/symbols.json'))).toBe(false);
    expect(symbolIndex.get('PLTR')).toBeDefined();
  });

  it('번들보다 낮은 원격본은 쓰지 않아요', async () => {
    const older = { ...bundledSymbols, contentVersion: '2020-01-01.1', items: [{ s: 'OLD', n: '옛 목록', m: 'US' }] };
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.endsWith('/symbols.json') ? respond(200, older) : respond(404))));
    await loadStatic(TODAY, '1.0.0');
    expect(liveStatic.get().remote).toEqual([]);
    expect(symbolIndex.get('OLD')).toBeUndefined();
  });
});
