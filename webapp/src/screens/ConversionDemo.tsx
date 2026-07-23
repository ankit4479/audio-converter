/**
 * A small looping visual on the landing page showing the actual shape of what
 * happens: a file goes in, something visibly moves, a converted file comes out.
 * No illustration or video asset - a moving dot along a connector line, built the
 * same way the SetupView drop zone's waveform is (plain CSS keyframes, frozen
 * rather than hidden under prefers-reduced-motion).
 */
import { useReducedMotion } from './useReducedMotion'

function FileChip({ label }: { label: string }) {
  return (
    <div className="flex w-28 flex-col items-center gap-2 rounded-chip border border-border bg-surface px-4 py-5">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          className="text-text-secondary"
        />
        <path
          d="M14 3v4h4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-mono text-mono-xs font-semibold text-text-primary">
        {label}
      </span>
    </div>
  )
}

export function ConversionDemo() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="flex items-center justify-center gap-4 sm:gap-6">
      <FileChip label="MP3" />
      <div className="relative h-px w-16 flex-1 max-w-24 bg-border sm:w-24">
        <span
          className={`absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent ${
            reduceMotion ? 'left-1/2 -translate-x-1/2' : 'animate-flow-dot'
          }`}
        />
      </div>
      <FileChip label="FLAC" />
    </div>
  )
}
