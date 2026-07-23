/**
 * Ported from Sources/AudioConverter/Views/SetupView.swift. Each section below is
 * its own component in this one file, mirroring the Swift file's own structure
 * ("Each section below is its own View struct, not a computed property" -
 * SetupView.swift:4-7) and its exact spacing, copy, and behaviour.
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import {
  CODECS,
  CODEC_IDS,
  COMPRESSION_TIERS,
  COMPRESSION_TIER_LABEL,
  QUALITY_TIERS,
  QUALITY_TIER_LABEL,
  SAMPLE_RATES,
  SAMPLE_RATE_LABEL,
  type CodecId,
  type CompressionTier,
  type QualityTier,
  type SampleRate,
} from '../engine/codec'
import { detectAudioEncoders, type DetectionResult } from '../engine/webcodecs'
import type { AudioFile } from '../intake/audioFile'
import type { FileIntakeStore } from '../intake/FileIntakeStore'
import { durationLabel, totalSizeLabel } from '../intake/labels'
import { scanDroppedItems } from '../intake/scanDropped'
import { scanFileList } from '../intake/scanFileList'
import { getCodecAvailabilityInfo } from '../ui/formatAvailability'

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
  settings: SetupSettings
  onSettingsChange: (settings: SetupSettings) => void
  onConvert: () => void
}

export function SetupView(props: SetupViewProps) {
  return (
    <div className="mx-auto max-w-[680px] space-y-5 p-6">
      <DropZoneSection store={props.store} />
      {props.files.length > 0 && (
        <>
          <FilesBarSection
            files={props.files}
            totalDuration={props.totalDuration}
            isCalculatingDuration={props.isCalculatingDuration}
            onClearAll={() => props.store.clear()}
          />
          <FilesDisclosureSection files={props.files} />
        </>
      )}
      <FormatPickerSection
        settings={props.settings}
        onSettingsChange={props.onSettingsChange}
      />
      <AdvancedSettingsSection
        settings={props.settings}
        onSettingsChange={props.onSettingsChange}
      />
      <ConvertButtonSection fileCount={props.files.length} onConvert={props.onConvert} />
    </div>
  )
}

// SetupView.swift:28-99
function DropZoneSection({ store }: { store: FileIntakeStore }) {
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
      <Waveform />
      <p className="text-body-lg font-semibold text-text-primary">
        Drag songs or folders here
      </p>
      <p className="max-w-[420px] text-center text-callout text-text-secondary">
        MP3, FLAC, WAV, AAC, ALAC, Opus, and more. Mixed formats are fine.
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

// SetupView.swift:244-268. All nine bars share one `grow` state, matching the Swift
// version's single shared boolean rather than staggered per-bar timing.
const WAVEFORM_HEIGHTS = [14, 26, 38, 20, 32, 16, 34, 22, 12]

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getReducedMotionSnapshot(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

function Waveform() {
  // useSyncExternalStore, not useEffect+setState: matchMedia is exactly the kind of
  // external, changing-outside-React source this hook exists for, and calling
  // setState directly in an effect body causes an avoidable extra render pass.
  const reduceMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  )

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

// SetupView.swift:101-124
function FilesBarSection({
  files,
  totalDuration,
  isCalculatingDuration,
  onClearAll,
}: {
  files: readonly AudioFile[]
  totalDuration: number
  isCalculatingDuration: boolean
  onClearAll: () => void
}) {
  const sizeLabel = totalSizeLabel(files)
  const timeLabel = durationLabel(totalDuration, isCalculatingDuration)
  const subtitle = [sizeLabel, timeLabel].filter((s) => s !== '').join(', ')

  return (
    <div className="flex items-center justify-between rounded-chip border border-border bg-surface p-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-body font-semibold text-text-primary">
          {files.length} song{files.length === 1 ? '' : 's'} added
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

// SetupView.swift:146-172
function FormatPickerSection({
  settings,
  onSettingsChange,
}: {
  settings: SetupSettings
  onSettingsChange: (settings: SetupSettings) => void
}) {
  const [detection, setDetection] = useState<DetectionResult>({
    aac: 'available',
    opus: 'available',
  })
  useEffect(() => {
    void detectAudioEncoders().then(setDetection)
  }, [])

  // Formats this browser genuinely cannot produce - no native encoder and (for
  // ALAC/WavPack/WMA/Vorbis specifically) no WASM path either - are left out of the
  // list entirely rather than shown disabled with an explanation. Simpler for
  // anyone just trying to pick a format that works; a browser-support note lives in
  // the README/docs for anyone who goes looking for a missing format.
  const isSupported = (id: CodecId) => !getCodecAvailabilityInfo(id, detection).disabled
  const commonCodecs = CODEC_IDS.filter(
    (id) => CODECS[id].group === 'common' && isSupported(id),
  )
  const moreCodecs = CODEC_IDS.filter(
    (id) => CODECS[id].group === 'more' && isSupported(id),
  )
  const codec = CODECS[settings.codec]
  const selectId = useId()

  // Safety net: if the previously-selected codec ever drops out of the supported
  // list (e.g. a runtime-detected one on a browser where support changes), fall back
  // to the first still-available option rather than leaving a hidden value selected.
  // Recomputes support from `detection` directly rather than closing over the
  // commonCodecs/moreCodecs above, so the effect's own dependencies stay accurate.
  useEffect(() => {
    if (!getCodecAvailabilityInfo(settings.codec, detection).disabled) return
    const fallback = CODEC_IDS.find(
      (id) => !getCodecAvailabilityInfo(id, detection).disabled,
    )
    if (fallback) onSettingsChange({ ...settings, codec: fallback })
  }, [settings, detection, onSettingsChange])

  return (
    <div className="space-y-1.5">
      <label htmlFor={selectId} className="text-body-sm font-semibold text-text-primary">
        Convert to
      </label>
      <div className="relative">
        <select
          id={selectId}
          className="w-full appearance-none rounded-chip border border-border bg-surface p-2 pr-9 text-text-primary"
          value={settings.codec}
          onChange={(e) =>
            onSettingsChange({ ...settings, codec: e.target.value as CodecId })
          }
        >
          <optgroup label="Common">
            {commonCodecs.map((id) => (
              <option key={id} value={id}>
                {CODECS[id].label}
              </option>
            ))}
          </optgroup>
          <optgroup label="More Formats">
            {moreCodecs.map((id) => (
              <option key={id} value={id}>
                {CODECS[id].label}
              </option>
            ))}
          </optgroup>
        </select>
        <SelectChevron />
      </div>
      <p className="text-caption text-text-secondary">
        {codec.tagline} {capitalize(codec.approxSizePerMinute)}.
      </p>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// SetupView.swift:174-221
function AdvancedSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: SetupSettings
  onSettingsChange: (settings: SetupSettings) => void
}) {
  const codec = CODECS[settings.codec]
  const switchId = useId()

  return (
    <details className="text-caption">
      <summary className="cursor-pointer text-text-secondary">Advanced settings</summary>
      <div className="mt-2 space-y-3 pt-2">
        {codec.kind === 'lossy' && (
          <>
            <p className="text-text-secondary">
              Best is tuned so the compression is not audible on real music, not just a
              bigger number. Lower tiers trade away some of that safety margin for a
              smaller file.
            </p>
            <LabeledSelect
              label="Quality"
              value={settings.quality}
              options={QUALITY_TIERS}
              optionLabel={(t) => QUALITY_TIER_LABEL[t]}
              onChange={(quality) => onSettingsChange({ ...settings, quality })}
            />
          </>
        )}
        {codec.kind === 'lossless' && (
          <>
            <p className="text-text-secondary">
              Lossless formats always sound identical to the original. This only changes
              file size and how long conversion takes.
            </p>
            {codec.supportsCompressionLevel && (
              <LabeledSelect
                label="Compression"
                value={settings.compression}
                options={COMPRESSION_TIERS}
                optionLabel={(t) => COMPRESSION_TIER_LABEL[t]}
                onChange={(compression) => onSettingsChange({ ...settings, compression })}
              />
            )}
          </>
        )}
        {codec.kind === 'uncompressed' && (
          <p className="text-text-secondary">
            WAV and AIFF store audio exactly as-is. There is nothing to tune except sample
            rate.
          </p>
        )}

        <LabeledSelect
          label="Sample rate"
          value={settings.sampleRate}
          options={SAMPLE_RATES}
          optionLabel={(r) => SAMPLE_RATE_LABEL[r]}
          onChange={(sampleRate) => onSettingsChange({ ...settings, sampleRate })}
        />

        <label htmlFor={switchId} className="flex items-center gap-2 text-text-primary">
          <input
            id={switchId}
            type="checkbox"
            role="switch"
            checked={settings.keepMetadata}
            onChange={(e) =>
              onSettingsChange({ ...settings, keepMetadata: e.target.checked })
            }
            className="accent-accent"
          />
          Song info and cover art
        </label>
      </div>
    </details>
  )
}

function LabeledSelect<T extends string>({
  label,
  value,
  options,
  optionLabel,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  optionLabel: (value: T) => string
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-text-primary">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          className="appearance-none rounded-chip border border-border bg-surface py-1 pl-2 pr-7 text-text-primary"
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
        <SelectChevron />
      </div>
    </div>
  )
}

// Native <select> arrows render however the browser's own UA styling decides to,
// which doesn't line up with this design system - appearance-none above strips
// that, and this SVG replaces it with one we control the size and alignment of.
function SelectChevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary"
      aria-hidden="true"
    >
      <path
        d="M5 9l7 7 7-7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// SetupView.swift:223-242
function ConvertButtonSection({
  fileCount,
  onConvert,
}: {
  fileCount: number
  onConvert: () => void
}) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        disabled={fileCount === 0}
        onClick={onConvert}
        className="rounded-chip bg-accent px-3 py-2 font-semibold text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {fileCount === 0
          ? 'Convert'
          : `Convert ${fileCount} Song${fileCount === 1 ? '' : 's'}`}
      </button>
    </div>
  )
}
