/**
 * The audio module (E0.3, issue #23): wraps the existing, already-shipped audio
 * engine as the first ConverterModule, proving the platform abstraction against
 * known-good code rather than a new one. No encoding logic changes here - this
 * only describes the existing engine declaratively and defers to it.
 *
 * Not yet wired into App/the scheduler (that's #24); registering and driving the
 * app through this module is deliberately out of scope here.
 */
import { isAudioFileName } from '../../intake/audioFileTypes'
import {
  CODEC_IDS,
  CODECS,
  COMPRESSION_TIER_LABEL,
  COMPRESSION_TIERS,
  QUALITY_TIER_LABEL,
  QUALITY_TIERS,
  SAMPLE_RATE_LABEL,
  SAMPLE_RATES,
  type ConversionSettings,
} from '../../engine/codec'
import { detectAudioEncoders } from '../../engine/webcodecs'
import { AUDIO_ENCODABLE_TARGETS } from '../../platform/graph'
import type {
  CapabilityReport,
  ConverterEngine,
  ConverterModule,
  FileMeta,
  SettingField,
} from '../../platform/module'

// Mirrors AppState.swift's defaults, also hardcoded today in App.tsx's
// DEFAULT_SETTINGS - #24 points App.tsx at this constant instead of keeping its
// own copy, closing that duplication once the app actually consumes the module.
const DEFAULT_SETTINGS: ConversionSettings = {
  codec: 'flac',
  quality: 'best',
  compression: 'balanced',
  sampleRate: 'keepOriginal',
  keepMetadata: true,
}

// Static baseline, unlike SetupView's live dropdown (which hides a codec once
// getCodecAvailabilityInfo/detectAudioEncoders reports it unavailable in this
// browser): SettingField has no notion of a dynamic/conditional option set yet,
// so aac/opus are listed here even on a browser where they'd turn out
// unsupported. Filtering by runtime availability is a SettingsPanel-layer
// concern for whatever later issue actually renders this schema.
const SETTINGS_SCHEMA: readonly SettingField[] = [
  {
    kind: 'select',
    key: 'codec',
    label: 'Format',
    options: AUDIO_ENCODABLE_TARGETS.map((id) => ({
      value: id,
      label: CODECS[id].label,
    })),
  },
  {
    kind: 'select',
    key: 'quality',
    label: 'Quality',
    options: QUALITY_TIERS.map((tier) => ({
      value: tier,
      label: QUALITY_TIER_LABEL[tier],
    })),
  },
  {
    kind: 'select',
    key: 'compression',
    label: 'Compression',
    options: COMPRESSION_TIERS.map((tier) => ({
      value: tier,
      label: COMPRESSION_TIER_LABEL[tier],
    })),
  },
  {
    kind: 'select',
    key: 'sampleRate',
    label: 'Sample rate',
    options: SAMPLE_RATES.map((rate) => ({
      value: rate,
      label: SAMPLE_RATE_LABEL[rate],
    })),
  },
  {
    kind: 'toggle',
    key: 'keepMetadata',
    label: 'Keep metadata',
  },
]

async function probe(): Promise<CapabilityReport> {
  // Warms and logs the existing runtime WebCodecs detection (issue #6) so it has
  // already run by the time a conversion is attempted, matching what SetupView
  // reads from the same detectAudioEncoders() cache today.
  await detectAudioEncoders()
  // WAV, MP3, and FLAC are all statically 'supported' (codec.ts) - none of them
  // depend on the runtime AAC/Opus detection above, so this module is never
  // wholly unsupported in any browser capable of running a Worker at all. A
  // supported:false report would only be honest if every implemented codec could
  // fail at once, which doesn't happen given today's codec set.
  return { supported: true }
}

export const audioModule: ConverterModule<ConversionSettings> = {
  id: 'audio',
  category: 'audio',
  label: 'Audio',
  accepts: (file: FileMeta) => isAudioFileName(file.name),
  // Matches graph.ts's edge model exactly: any codec can be a nominal source
  // ("from"), but only AUDIO_ENCODABLE_TARGETS actually have a working encoder
  // ("to") today.
  inputFormats: CODEC_IDS,
  outputFormats: AUDIO_ENCODABLE_TARGETS,
  settingsSchema: SETTINGS_SCHEMA,
  defaultSettings: DEFAULT_SETTINGS,
  probe,
  // Dynamic import is the code-split boundary: Converter (and everything it
  // pulls in - Mediabunny, the mp3/flac WASM encoders) only enters a chunk that
  // loads when an audio conversion is actually requested, never the initial
  // bundle another module's page would load.
  loadEngine: async (): Promise<ConverterEngine<ConversionSettings>> => {
    const { Converter } = await import('../../engine/converter')
    return new Converter()
  },
}
