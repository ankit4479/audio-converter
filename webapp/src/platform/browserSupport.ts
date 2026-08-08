/**
 * The floor every module needs regardless of format: a Worker to run the engine
 * in, WebAssembly for the WASM encoders, and enough File API to read a dropped
 * file. Distinct from a module's own probe() (image, audio, pdf) - those check
 * format-specific APIs (createImageBitmap, OffscreenCanvas, ...) on top of this
 * floor, never this floor itself, so every module can assume it already holds.
 *
 * This is the web equivalent of the Mac app's MissingFFmpegView gate
 * (ContentView.swift:8-9): without it nothing on the page can work at all, so
 * it is checked once for the whole app rather than per module (issue #16).
 */
import type { CapabilityReport } from './module'

export function checkBrowserSupport(): CapabilityReport {
  if (typeof Worker === 'undefined') {
    return {
      supported: false,
      reason: "This browser doesn't support Web Workers, which the converter needs to run.",
    }
  }
  if (typeof WebAssembly === 'undefined') {
    return {
      supported: false,
      reason: "This browser doesn't support WebAssembly, which the converter's encoders need.",
    }
  }
  if (typeof File === 'undefined' || typeof FileReader === 'undefined') {
    return {
      supported: false,
      reason: "This browser doesn't support reading files, which the converter needs to open what you drop.",
    }
  }
  return { supported: true }
}
