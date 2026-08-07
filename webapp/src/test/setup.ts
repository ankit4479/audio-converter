import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// @testing-library/react's own automatic cleanup relies on detecting a *global*
// afterEach - this project deliberately doesn't enable vitest's `globals: true`
// (test files import describe/it/expect explicitly), so that auto-registration never
// fires and every rendered component from every test accumulates in the DOM across
// the whole file. Caught this directly: SetupView tests passed in isolation but
// failed en masse together, with getByRole matching leftover buttons from earlier
// tests' unmounted-in-name-only renders.
afterEach(() => {
  cleanup()
})

// jsdom doesn't implement matchMedia at all. Defaults to "no preference" (matches:
// false) for every query; tests that need to simulate prefers-reduced-motion:
// reduce override window.matchMedia directly. Guarded on `window` existing at all,
// not just matchMedia being a function on it - some test files (codec.test.ts) opt
// into the plain node environment specifically to prove they have no DOM dependency,
// and this setup file runs for every test file regardless of its own environment.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom doesn't implement Element.scrollIntoView at all - calling it throws "is not
// a function", which any component (or Radix primitive) that scrolls something into
// view would hit the moment it renders in a test.
if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.scrollIntoView !== 'function'
) {
  Element.prototype.scrollIntoView = () => {}
}

// Node 22+'s own experimental global `localStorage` shadows jsdom's with a stub
// that has no methods at all (window.localStorage exists but every call throws
// "is not a function") - caught via recentConversions.test.ts failing under plain
// `npm test` despite passing with NODE_OPTIONS=--no-experimental-webstorage. A
// small in-memory polyfill sidesteps the conflict without depending on how the
// test runner is invoked.
if (typeof window !== 'undefined' && typeof window.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>()
  const polyfill: Storage = {
    get length() {
      return store.size
    },
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index) => [...store.keys()][index] ?? null,
  }
  Object.defineProperty(window, 'localStorage', {
    value: polyfill,
    configurable: true,
    writable: true,
  })
}
