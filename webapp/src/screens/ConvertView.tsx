/**
 * Ported from Sources/AudioConverter/Views/ConvertView.swift. Each section below is
 * its own component in this one file, same convention SetupView.tsx follows.
 */
import type { BatchJob } from '../engine/batchScheduler'
import { BatchScheduler } from '../engine/batchScheduler'
import type { OutputDestination, OutputMode } from '../output/OutputDestination'
import { truncateMiddle } from './truncateMiddle'

export interface ConvertViewProps {
  scheduler: BatchScheduler
  destination: OutputDestination
  codecLabel: string
  /** True once the destination has actually finished finalizing (the zip has
   *  built and downloaded, the single file has downloaded, or the directory write
   *  - already synchronous by the time scheduler.isFinished flips - has settled).
   *  The done card waits for this too, not just scheduler.isFinished, so its
   *  primary button never renders before there's anything to redownload/reopen. */
  finalized: boolean
  onChange: () => void
  onConvertMore: () => void
}

export function ConvertView({
  scheduler,
  destination,
  codecLabel,
  finalized,
  onChange,
  onConvertMore,
}: ConvertViewProps) {
  return (
    <div className="mx-auto max-w-[680px] space-y-5 p-6">
      <FolderChip destination={destination} codecLabel={codecLabel} onChange={onChange} />
      <ProgressBlock scheduler={scheduler} codecLabel={codecLabel} />
      {scheduler.isFinished && finalized && (
        <DoneCard
          scheduler={scheduler}
          destination={destination}
          onConvertMore={onConvertMore}
        />
      )}
    </div>
  )
}

// ConvertView.swift:28-46. A browser can only ever show the chosen folder's own
// name, never a full filesystem path (see OutputDestination.destinationLabel).
const DESTINATION_LABEL_MAX_CHARS = 56

function FolderChip({
  destination,
  codecLabel,
  onChange,
}: {
  destination: OutputDestination
  codecLabel: string
  onChange: () => void
}) {
  const fullLabel = destination.destinationLabel(codecLabel)
  return (
    <div className="flex items-center gap-2 rounded-chip border border-border bg-surface p-3">
      <FolderIcon />
      <span
        className="flex-1 overflow-hidden whitespace-nowrap font-mono text-mono-sm text-text-primary"
        title={fullLabel}
      >
        {truncateMiddle(fullLabel, DESTINATION_LABEL_MAX_CHARS)}
      </span>
      <button
        type="button"
        onClick={onChange}
        className="text-caption text-text-secondary underline"
      >
        Change
      </button>
    </div>
  )
}

// ConvertView.swift:48-68
function ProgressBlock({
  scheduler,
  codecLabel,
}: {
  scheduler: BatchScheduler
  codecLabel: string
}) {
  const finishedCount = scheduler.completedCount + scheduler.failedJobs.length
  const progress = scheduler.totalCount === 0 ? 0 : finishedCount / scheduler.totalCount
  const label = scheduler.isFinished
    ? `Converted ${scheduler.completedCount} of ${scheduler.totalCount}`
    : `Converting ${finishedCount} of ${scheduler.totalCount}`
  const currentFileName = scheduler.currentFileNames[0]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-body-sm font-medium text-text-primary">{label}</p>
        {scheduler.estimatedTimeRemainingLabel && (
          <p className="text-caption text-text-secondary">
            {scheduler.estimatedTimeRemainingLabel}
          </p>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      {currentFileName && (
        <p className="font-mono text-mono-xs text-text-secondary">
          Converting: {currentFileName} to {codecLabel}
        </p>
      )}
    </div>
  )
}

const MAX_SHOWN_FAILURES = 5

function failureReason(job: BatchJob): string {
  return job.status.kind === 'failed' ? job.status.reason : 'unknown error'
}

// ConvertView.swift:70-118
function DoneCard({
  scheduler,
  destination,
  onConvertMore,
}: {
  scheduler: BatchScheduler
  destination: OutputDestination
  onConvertMore: () => void
}) {
  const failed = scheduler.failedJobs
  const shown = failed.slice(0, MAX_SHOWN_FAILURES)
  const remaining = failed.length - shown.length

  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-7 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success">
        <CheckIcon />
      </div>

      <div className="space-y-1">
        <p className="text-title font-semibold text-text-primary">
          {scheduler.completedCount} of {scheduler.totalCount} songs converted
        </p>
        {failed.length > 0 && (
          <p className="text-callout text-text-secondary">
            {failed.length} could not be converted
          </p>
        )}
      </div>

      {failed.length > 0 && (
        <ul className="mx-auto max-w-[380px] space-y-1 text-left text-caption text-text-secondary">
          {shown.map((job) => (
            <li key={job.id}>
              - {job.file.displayName}, {failureReason(job)}
            </li>
          ))}
          {remaining > 0 && <li>and {remaining} more</li>}
        </ul>
      )}

      <div className="flex justify-center gap-2.5">
        <button
          type="button"
          onClick={() => void destination.revealDestination()}
          className="rounded-chip bg-accent px-3 py-2 font-semibold text-accent-ink hover:bg-accent-hover"
        >
          {revealButtonLabel(destination.mode)}
        </button>
        <button
          type="button"
          onClick={onConvertMore}
          className="rounded-chip border border-border px-3 py-2 font-semibold text-text-primary"
        >
          Convert More
        </button>
      </div>
    </div>
  )
}

// "Show in Finder" has no browser equivalent (issue #15's "one necessary
// difference") - each output mode does the closest useful thing instead
// (OutputDestination.revealDestination), and the label says what it actually does
// rather than promising a Finder reveal it can't deliver.
function revealButtonLabel(mode: OutputMode): string {
  return mode === 'directory' ? 'Open Destination Folder' : 'Download Again'
}

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 text-accent"
      aria-hidden="true"
    >
      <path
        d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white"
      aria-hidden="true"
    >
      <path
        d="M5 13l4.5 4.5L19 8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
