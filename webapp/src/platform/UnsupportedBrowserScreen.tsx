/**
 * Web equivalent of the Mac app's MissingFFmpegView (ContentView.swift:23-39):
 * warning glyph, headline, plain explanation capped at 360px, no dismiss - a
 * hard block, because without the checked capability nothing on the page can
 * work. Reused for both the app-wide floor (browserSupport.ts) and a module's
 * own probe() failing, which only differ in copy (issue #16).
 */
import { MACOS_DOWNLOAD_URL } from '../ui/formatAvailability'

export function UnsupportedBrowserScreen({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-8 text-text-secondary"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v4m0 3.5h.01M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.3 2.25h17.76a1.5 1.5 0 0 0 1.3-2.25L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"
        />
      </svg>
      <h2 className="font-semibold text-text-primary">This browser can't run the converter</h2>
      <p className="max-w-[360px] text-sm text-text-secondary">{reason}</p>
      <p className="max-w-[360px] text-sm text-text-secondary">
        Try the latest Chrome, Edge, or Safari, or use the{' '}
        <a href={MACOS_DOWNLOAD_URL} className="text-text-primary underline">
          Mac app
        </a>{' '}
        instead.
      </p>
    </div>
  )
}
