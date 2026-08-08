/**
 * Renders a combine() run (issue #39's "Combine into one PDF") - deliberately not
 * ConvertView, since a combine run has no per-file BatchJob list, only one
 * progress fraction and one eventual result. Mirrors ConvertView's layout and
 * reuses its FolderChip/revealButtonLabel/CheckIcon rather than duplicating them.
 */
import type { CombineSnapshot } from './ConversionController'
import { CheckIcon, FolderChip, revealButtonLabel } from './ConvertView'
import type { OutputDestination } from '../output/OutputDestination'
import type { ModulePresentation } from '../platform/module'

export interface CombineConvertViewProps {
  combine: CombineSnapshot
  destination: OutputDestination
  targetLabel: string
  presentation: ModulePresentation
  finalized: boolean
  onChange: () => void
  onConvertMore: () => void
}

export function CombineConvertView({
  combine,
  destination,
  targetLabel,
  presentation,
  finalized,
  onChange,
  onConvertMore,
}: CombineConvertViewProps) {
  return (
    <div className="mx-auto max-w-[680px] space-y-5 p-6">
      <FolderChip
        destination={destination}
        targetLabel={targetLabel}
        onChange={onChange}
      />
      {combine.result === null && combine.error === null && (
        <CombineProgress combine={combine} targetLabel={targetLabel} />
      )}
      {combine.error !== null && <CombineFailedCard error={combine.error} />}
      {combine.result !== null && finalized && (
        <CombineDoneCard
          combine={combine}
          destination={destination}
          presentation={presentation}
          onConvertMore={onConvertMore}
        />
      )}
    </div>
  )
}

function CombineProgress({
  combine,
  targetLabel,
}: {
  combine: CombineSnapshot
  targetLabel: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-body-sm font-medium text-text-primary">
        Combining {combine.total} images into one {targetLabel}
      </p>
      <div
        role="progressbar"
        aria-valuenow={Math.round(combine.progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${combine.progress * 100}%` }}
        />
      </div>
    </div>
  )
}

function CombineFailedCard({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Combining failed.'
  return (
    <div className="space-y-1 rounded-card border border-border bg-surface p-7 text-center">
      <p className="text-title font-semibold text-text-primary">
        Could not combine images
      </p>
      <p className="text-callout text-text-secondary">{message}</p>
    </div>
  )
}

function CombineDoneCard({
  combine,
  destination,
  presentation,
  onConvertMore,
}: {
  combine: CombineSnapshot
  destination: OutputDestination
  presentation: ModulePresentation
  onConvertMore: () => void
}) {
  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-7 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success">
        <CheckIcon />
      </div>
      <p className="text-title font-semibold text-text-primary">
        Combined {combine.total}{' '}
        {combine.total === 1 ? presentation.item.singular : presentation.item.plural} into
        one PDF
      </p>
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
