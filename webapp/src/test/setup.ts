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
