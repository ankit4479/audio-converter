/**
 * The setup screen: drop zone, file list, the active module's settings, convert
 * button. Ported from Sources/AudioConverter/Views/SetupView.swift, keeping each
 * section as its own component in one file the way the Swift file does ("Each
 * section below is its own View struct, not a computed property" -
 * SetupView.swift:4-7), along with its exact spacing and behaviour.
 *
 * Module-agnostic since E2.1 (issue #31): the settings themselves arrive as a
 * `settings` node (audio passes screens/AudioSettings, other modules get the
 * schema-driven platform/SettingsPanel), and the handful of words that can only come
 * from the module - what one file is called, what may be dropped, whether a playing
 * time means anything - come from ModulePresentation. The audio screen renders
 * exactly as it did before that change; the strings are the same strings, just
 * sourced from modules/audio rather than written here.
 */
import { useRef, useState, type ReactNode } from 'react'
import type { CodecId } from '../engine/codec'
import type { CompressionTier, QualityTier, SampleRate } from '../engine/codec'
import type { AudioFile } from '../intake/audioFile'
import type { FileIntakeStore } from '../intake/FileIntakeStore'
import { durationLabel, totalSizeLabel } from '../intake/labels'
import { scanDroppedItems } from '../intake/scanDropped'
import { scanFileList } from '../intake/scanFileList'
import type { CategoryId, ModulePresentation } from '../platform/module'
import { useReducedMotion } from './useReducedMotion'

/** The audio module's settings shape. Lives here rather than in modules/audio only
 *  because engine/codec.ts's ConversionSettings is the worker-facing type and this
 *  is its screen-facing twin; they are structurally identical. */
export interface SetupSettings {
  codec: CodecId
  quality: QualityTier
  compression: CompressionTier
  sampleRate: SampleRate
  keepMetadata: boolean
}

export interface SetupViewProps {
  store: FileIntakeStore
  files: readonly AudioFile[]
  totalDuration: number
  isCalculatingDuration: boolean
  /** The active module's settings controls. */
  settings: ReactNode
  /** Which words this screen uses for the files it is holding. */
  presentation: ModulePresentation
  /** Picks the drop-zone glyph. Kept out of ModulePresentation because that has to
   *  stay worker-safe, and an icon is JSX. */
  category: CategoryId
  onConvert: () => void
}

export function SetupView(props: SetupViewProps) {
  const { item } = props.presentation
  return (
    <div className="mx-auto max-w-[680px] space-y-5 p-6">
      <DropZoneSection
        store={props.store}
        presentation={props.presentation}
        category={props.category}
      />
      {props.files.length > 0 && (
        <>
          <FilesBarSection
            files={props.files}
            totalDuration={props.totalDuration}
            isCalculatingDuration={props.isCalculatingDuration}
            presentation={props.presentation}
            onClearAll={() => props.store.clear()}
          />
          <FilesDisclosureSection files={props.files} />
        </>
      )}
      {props.settings}
      <ConvertButtonSection
        fileCount={props.files.length}
        item={item}
        onConvert={props.onConvert}
      />
    </div>
  )
}

// SetupView.swift:28-99
function DropZoneSection({
  store,
  presentation,
  category,
}: {
  store: FileIntakeStore
  presentation: ModulePresentation
  category: CategoryId
}) {
  const [isDropTargeted, setIsDropTargeted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDropTargeted(false)
    void scanDroppedItems(event.dataTransfer.items).then((scanned) =>
      store.addFiles(scanned),
    )
  }

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-dropzone border-[1.5px] border-dashed bg-surface py-8 ${
        isDropTargeted ? 'border-accent' : 'border-border'
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDropTargeted(true)
      }}
      onDragLeave={() => setIsDropTargeted(false)}
      onDrop={handleDrop}
    >
      <DropZoneGlyph category={category} />
      <p className="text-body-lg font-semibold text-text-primary">
        Drag {presentation.item.plural} or folders here
      </p>
      <p className="max-w-[420px] text-center text-callout text-text-secondary">
        {presentation.intakeHint}
      </p>
      <button
        type="button"
        className="rounded-chip bg-accent px-4 py-1.5 text-body-sm font-semibold text-accent-ink hover:bg-accent-hover"
        onClick={() => inputRef.current?.click()}
      >
        Choose Files or a Folder
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) store.addFiles(scanFileList(e.target.files))
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** One glyph per category. A map in the UI layer rather than a field on the module,
 *  because platform/module.ts must stay free of React (a module's engine runs in a
 *  Worker) - so a module can carry the words for its drop zone but not its icon. */
function DropZoneGlyph({ category }: { category: CategoryId }) {
  return category === 'audio' ? <Waveform /> : <ImageGlyph />
}

// SetupView.swift:244-268. All nine bars share one `grow` state, matching the Swift
// version's single shared boolean rather than staggered per-bar timing.
const WAVEFORM_HEIGHTS = [14, 26, 38, 20, 32, 16, 34, 22, 12]

function Waveform() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="flex h-10 items-end gap-1">
      {WAVEFORM_HEIGHTS.map((height, i) => (
        <span
          key={i}
          className={`w-1 rounded-full bg-accent/75 ${reduceMotion ? '' : 'animate-waveform'}`}
          style={{
            height: reduceMotion ? height : height * 0.55,
            ['--waveform-height' as string]: `${height}px`,
          }}
        />
      ))}
    </div>
  )
}

/** Same 40px box the waveform occupies, so swapping glyphs can't shift the drop
 *  zone's height between modules. */
function ImageGlyph() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="text-accent/75"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
      <path
        d="M5 17l4.5-5 3 3L16 11l3 3.5V17H5Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// SetupView.swift:101-124
function FilesBarSection({
  files,
  totalDuration,
  isCalculatingDuration,
  presentation,
  onClearAll,
}: {
  files: readonly AudioFile[]
  totalDuration: number
  isCalculatingDuration: boolean
  presentation: ModulePresentation
  onClearAll: () => void
}) {
  const sizeLabel = totalSizeLabel(files)
  // No playing time for files that don't have one (images), rather than a stray
  // "0 seconds" next to the size.
  const timeLabel = presentation.tracksDuration
    ? durationLabel(totalDuration, isCalculatingDuration)
    : ''
  const subtitle = [sizeLabel, timeLabel].filter((s) => s !== '').join(', ')

  return (
    <div className="flex items-center justify-between rounded-chip border border-border bg-surface p-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-body font-semibold text-text-primary">
          {files.length}{' '}
          {files.length === 1 ? presentation.item.singular : presentation.item.plural}{' '}
          added
        </p>
        <p className="text-caption text-text-secondary">{subtitle}</p>
      </div>
      <button
        type="button"
        className="text-caption text-text-secondary underline"
        onClick={onClearAll}
      >
        Clear all
      </button>
    </div>
  )
}

// SetupView.swift:126-144
function FilesDisclosureSection({ files }: { files: readonly AudioFile[] }) {
  return (
    <details className="text-caption">
      <summary className="cursor-pointer text-text-secondary">
        Show the {files.length} files
      </summary>
      <div className="mt-2 max-h-[140px] space-y-[3px] overflow-y-auto">
        {files.map((file) => (
          <p key={file.id} className="font-mono text-mono-xs text-text-secondary">
            {file.relativePath}
          </p>
        ))}
      </div>
    </details>
  )
}

// SetupView.swift:223-242
function ConvertButtonSection({
  fileCount,
  item,
  onConvert,
}: {
  fileCount: number
  item: ModulePresentation['item']
  onConvert: () => void
}) {
  const noun = fileCount === 1 ? item.singular : item.plural
  return (
    <div className="flex justify-end">
      <button
        type="button"
        disabled={fileCount === 0}
        onClick={onConvert}
        className="rounded-chip bg-accent px-3 py-2 font-semibold text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {fileCount === 0 ? 'Convert' : `Convert ${fileCount} ${capitalize(noun)}`}
      </button>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
