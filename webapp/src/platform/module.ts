/**
 * Format-agnostic module contract (E0.1, issue #21). A ConverterModule is a
 * self-contained conversion capability for one category (audio, image, ...); the
 * platform shell only ever talks to modules through this interface, never to a
 * concrete engine directly. Pure types plus trivial helpers only - no engine logic,
 * no graph, no UI. See docs/platform-expansion-plan.md section 3.
 *
 * Worker-safe: nothing here may import React or the DOM lib, since a module's
 * engine (ConverterEngine) is meant to run loaded inside a Web Worker.
 */
import type { ConvertProgress, ConvertResult } from '../engine/convert'

// Re-exported because ConverterEngine.convert's signature uses them directly - a
// module implementation only needs to import from here, not also from
// engine/convert.ts. ConversionError/ConversionErrorReason aren't re-exported: no
// signature in this file references them, so pulling them in here would just be
// speculative surface area (a thrown error type, not a declared one).
export type { ConvertProgress, ConvertResult }

/** Which top-level section of the site a module belongs to (drives the mega-menu
 *  and home category grid once the graph/registry exist - #22). */
export type CategoryId = 'audio' | 'image' | 'video' | 'gif' | 'pdf' | 'archive'

/** A format node id (e.g. 'mp3', 'heic', 'webp'). Kept as a plain string alias here
 *  rather than a closed union - the conversion graph (#22) is the source of truth
 *  for which ids exist; this module only needs to talk about them opaquely. */
export type FormatId = string

/** The minimal shape accepts() needs to decide whether a module can take a file,
 *  without requiring a real File/Blob (so it's also usable against ScannedFile-like
 *  inputs from any intake source). */
export interface FileMeta {
  readonly name: string
  readonly type: string
  readonly size: number
}

/** Result of a module's runtime capability probe (e.g. "does this browser have a
 *  WASM/WebCodecs path for HEIC decode"). Mirrors the pattern engine/formats.ts's
 *  ensureReady already uses for audio, generalized so the shell can show a clear
 *  message before a conversion is attempted rather than failing deep inside a
 *  worker. */
export interface CapabilityReport {
  readonly supported: boolean
  /** Present only when supported is false; shown to the user as-is. */
  readonly reason?: string
}

/**
 * Declarative description of one settings-panel field. A discriminated union so
 * the shared SettingsPanel (later issue) can render any module's settings from
 * data alone - modules never ship their own settings JSX.
 */
export type SettingField =
  | {
      readonly kind: 'select'
      readonly key: string
      readonly label: string
      readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>
    }
  | {
      readonly kind: 'slider'
      readonly key: string
      readonly label: string
      readonly min: number
      readonly max: number
      readonly step: number
    }
  | {
      readonly kind: 'toggle'
      readonly key: string
      readonly label: string
    }
  | {
      readonly kind: 'color'
      readonly key: string
      readonly label: string
    }

/** A running conversion engine for one module. One engine instance owns one Worker
 *  (mirrors engine/converter.ts's Converter, which is the audio module's
 *  ConverterEngine as of #23). The scheduler creates one per concurrent job slot
 *  and calls dispose() when done with it.
 *
 *  Generic over the module's own settings shape (TSettings) rather than typing
 *  settings as `Record<string, unknown>` outright: a plain interface like
 *  Converter.convert's `ConversionSettings` isn't structurally assignable to a
 *  `Record<string, unknown>` parameter (no index signature), so a non-generic
 *  ConverterEngine could never truthfully describe the existing audio engine -
 *  confirmed by trying exactly that and watching `tsc -b` reject it. The default
 *  keeps the platform-shell-facing type (ConverterModule.loadEngine's return
 *  before a module supplies its own TSettings) usable without every caller having
 *  to pin a concrete settings type down. */
export interface ConverterEngine<TSettings = Record<string, unknown>> {
  convert(
    file: Blob,
    baseName: string,
    settings: TSettings,
    options?: {
      onProgress?: (progress: ConvertProgress) => void
      signal?: AbortSignal
    },
  ): Promise<ConvertResult>

  /** Releases the underlying worker. The engine is unusable after this, same
   *  contract as Converter.dispose(). */
  dispose(): void
}

/** A self-contained conversion capability for one category. The platform shell
 *  (intake, settings panel, scheduler, output) drives every module through this
 *  same shape - see docs/platform-expansion-plan.md section 3.
 *
 *  Generic over TSettings for the same reason as ConverterEngine above: a
 *  concrete module (e.g. the audio module in #23, typed ConverterModule<
 *  ConversionSettings>) keeps its real settings type end to end, while code that
 *  only needs to hold modules generically (the registry, #22) can use the
 *  unparameterized ConverterModule<Record<string, unknown>> default. */
export interface ConverterModule<TSettings = Record<string, unknown>> {
  readonly id: string
  readonly category: CategoryId
  readonly label: string

  /** Whether this module can take the given file as input. */
  accepts(file: FileMeta): boolean

  readonly inputFormats: readonly FormatId[]
  readonly outputFormats: readonly FormatId[]

  readonly settingsSchema: readonly SettingField[]
  readonly defaultSettings: TSettings

  /** Runs once before the module is shown as usable, so an unsupported browser
   *  gets a clear message up front instead of a deep failure mid-conversion. */
  probe(): Promise<CapabilityReport>

  /** Lazily imports and constructs this module's engine. The dynamic import here
   *  is the code-split boundary: a module's WASM/engine code must not appear in
   *  another module's (or the shell's) bundle. */
  loadEngine(): Promise<ConverterEngine<TSettings>>
}
