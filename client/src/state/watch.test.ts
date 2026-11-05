import { beforeEach, describe, expect, it } from 'vitest';

import { readJson } from '../lib/storage';
import { addWatch, loadWatch, parseWatch, removeWatch, WATCH_KEY, WATCH_MAX, watchStore } from './watch';

describe('parseWatch', () => {
  it('모양이 다르면 빈 목록', () => {
    expect(parseWatch(null)).toEqual([]);
    expect(parseWatch({ version: 2, items: [] })).toEqual([]);
    expect(parseWatch({ version: 1, items: [{ id: 'NVDA|1d', symbol: 'NVDA', interval: '1h', addedAt: 1 }] })).toEqual([]);
    expect(parseWatch({ version: 1, items: [{ id: 'X|1d', symbol: 'NVDA', interval: '1d', addedAt: 1 }] })).toEqual([]);
  });

  it('같은 id 는 한 번만', () => {
    const it1 = { id: 'NVDA|1d', symbol: 'NVDA', interval: '1d', addedAt: 1 };
    expect(parseWatch({ version: 1, items: [it1, it1] })).toEqual([it1]);
  });
});

describe('addWatch · removeWatch', () => {
  beforeEach(() => watchStore.set({ ready: true, items: [] }));

  it('맨 아래에 더하고 저장해요. 이미 담은 것은 건너뛰어요', async () => {
    expect(addWatch([{ symbol: 'NVDA', interval: '1d' }], 10)).toBe(1);
    expect(addWatch([{ symbol: 'NVDA', interval: '1d' }, { symbol: 'NVDA', interval: '1wk' }, { symbol: '005930.KS', interval: '1d' }], 20)).toBe(2);
    expect(watchStore.get().items.map((i) => i.id)).toEqual(['NVDA|1d', 'NVDA|1wk', '005930.KS|1d']);
    await new Promise((r) => setTimeout(r, 0));
    expect(parseWatch(await readJson(WATCH_KEY))).toEqual(watchStore.get().items);
  });

  it(`${WATCH_MAX}개까지만`, () => {
    const many = Array.from({ length: WATCH_MAX + 5 }, (_, i) => ({ symbol: `T${i}`, interval: '1d' as const }));
    expect(addWatch(many)).toBe(WATCH_MAX);
    expect(addWatch([{ symbol: 'NVDA', interval: '1d' }])).toBe(0);
  });

  it('빼고 다시 읽어도 같아요', async () => {
    addWatch([{ symbol: 'NVDA', interval: '1d' }, { symbol: 'TSLA', interval: '1d' }]);
    removeWatch('NVDA|1d');
    await new Promise((r) => setTimeout(r, 0));
    watchStore.set({ ready: false, items: [] });
    await loadWatch();
    expect(watchStore.get()).toMatchObject({ ready: true, items: [{ id: 'TSLA|1d' }] });
  });
});
