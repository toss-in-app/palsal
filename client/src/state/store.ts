import { useSyncExternalStore } from 'react';

/** 화면을 오가도 남아야 하는 값(담은 종목 · 설정 · 카드 시세)을 담는 아주 작은 저장소 */
export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(fn: (prev: T) => T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      if (Object.is(next, state)) return;
      state = next;
      listeners.forEach((l) => l());
    },
    update(fn) {
      this.set(fn(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
