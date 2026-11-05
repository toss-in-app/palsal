// vitest 공통 설정: jest-dom 매처 + jsdom 에 없는 브라우저 API 흉내 (mandalartplan 에서 가져옴)
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
if (!window.ResizeObserver) window.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver;
if (!window.IntersectionObserver) window.IntersectionObserver = NoopObserver as unknown as typeof IntersectionObserver;
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// TDS(Radix focus guard)가 난독화된 선택자로 querySelectorAll 을 호출하는데 jsdom 이 "Invalid selector" 로 던져요.
for (const proto of [Document.prototype, Element.prototype, DocumentFragment.prototype]) {
  const original = proto.querySelectorAll;
  proto.querySelectorAll = function patched(this: ParentNode, selectors: string) {
    try {
      return original.call(this, selectors);
    } catch (error) {
      const e = error as { name?: string; code?: number } | null;
      if (e && (e.name === 'SyntaxError' || e.code === 12)) return [] as unknown as NodeListOf<Element>;
      throw error;
    }
  } as typeof proto.querySelectorAll;
}
