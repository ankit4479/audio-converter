/**
 * The audio module's settings panel: the "Convert to" picker plus the advanced
 * disclosure. Ported from Sources/AudioConverter/Views/SetupView.swift:146-221 and
 * moved here verbatim in E2.1 (issue #31), when SetupView became the module-agnostic
 * tool layout and could no longer carry one module's controls.
 *
 * Audio deliberately keeps a bespoke panel rather than moving onto the
 * schema-driven SettingsPanel: its copy is conditional on the codec's *kind* (the
 * lossy/lossless/uncompressed explanations, and whether a compression level even
 * exists), which SettingField has no way to express. Folding audio onto the schema
 * would mean either losing that copy or teaching the schema about conditional prose;
 * both are their own issue.
 */
import { useEffect, useId, useState } from 'react'
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
} from '../engine/codec'
import { SelectChevron } from '../components/SelectChevron'
import { detectAudioEncoders, type DetectionResult } from '../engine/webcodecs'
import { FormatSelect } from '../platform/FormatSelect'
import { getCodecAvailabilityInfo } from '../ui/formatAvailability'
import type { SetupSettings } from './SetupView'

export interface AudioSettingsProps {
  settings: SetupSettings
  onSettingsChange: (settings: SetupSettings) => void
  /** A finished output-format pick. See FormatSelect for why this is separate from
   *  the visible value changing. */
  onTargetCommit: (codec: CodecId) => void
  /** The source format this page is about, when it is about one specific
   *  conversion. Left out of the "Convert to" list: the graph has no X-to-X edge
   *  (graph.ts filters `to !== from`), so there is no page for it and picking it
   *  could only ever be a settings change that leaves the URL and the h1 claiming a
   *  different output than the widget would produce. */
  source?: string
}

export function AudioSettings(props: AudioSettingsProps) {
  return (
    <>
      <FormatPickerSection {...props} />
      <AdvancedSettingsSection
        settings={props.settings}
        onSettingsChange={props.onSettingsChange}
      />
    </>
  )
}

// SetupView.swift:146-172
function FormatPickerSection({
  settings,
  onSettingsChange,
  onTargetCommit,
  source,
}: AudioSettingsProps) {
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
  const isOffered = (id: CodecId) => id !== source && isSupported(id)
  const optionsFor = (group: 'common' | 'more') =>
    CODEC_IDS.filter((id) => CODECS[id].group === group && isOffered(id)).map((id) => ({
      value: id,
      label: CODECS[id].label,
    }))
  const codec = CODECS[settings.codec]

  // Safety net: if the previously-selected codec ever drops out of the supported
  // list (e.g. a runtime-detected one on a browser where support changes), fall back
  // to the first still-available option rather than leaving a hidden value selected.
  // Deliberately onSettingsChange and not onTargetCommit: this fires on mount, and
  // routing it through the navigating path would silently redirect a visitor who
  // opened a page for a format their browser can't encode.
  // Recomputes support from `detection` directly rather than closing over the
  // option lists above, so the effect's own dependencies stay accurate.
  useEffect(() => {
    if (!getCodecAvailabilityInfo(settings.codec, detection).disabled) return
    const fallback = CODEC_IDS.find(
      (id) => id !== source && !getCodecAvailabilityInfo(id, detection).disabled,
    )
    if (fallback) onSettingsChange({ ...settings, codec: fallback })
  }, [settings, detection, onSettingsChange, source])

  return (
    <FormatSelect
      label="Convert to"
      value={settings.codec}
      groups={[
        { label: 'Common', options: optionsFor('common') },
        { label: 'More Formats', options: optionsFor('more') },
      ]}
      description={`${codec.tagline} ${capitalize(codec.approxSizePerMinute)}.`}
      onValueChange={(value) =>
        onSettingsChange({ ...settings, codec: value as CodecId })
      }
      onCommit={(value) => onTargetCommit(value as CodecId)}
    />
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
