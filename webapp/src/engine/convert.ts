/**
 * The conversion engine core. Runs entirely off the main thread (see convert.worker.ts
 * for the Comlink-exposed entry point) — this module only depends on Mediabunny and
 * standard Web APIs, so it's testable and reviewable without a Worker in the loop.
 *
 * Uses Mediabunny's high-level Conversion API (demux, decode, encode, and mux all
 * driven by one call) rather than manually pulling PCM through a decoder and handing
 * it to a per-format encoder as issue #4's original plan sketched — that hand-rolled
 * shape was written before reading Mediabunny's actual API. Conversion.init/execute
 * already does exactly that internally, hardware-accelerated via WebCodecs, and
 * exposes the same progress/cancel hooks the plan asked for, so building our own
 * layer underneath it would just be reimplementing what the library already does.
 */
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  ConversionCanceledError,
  Input,
  Output,
} from 'mediabunny'
import { SAMPLE_RATE_HZ, type ConversionSettings } from './codec'
import { encodableFormatFor, outputFileName } from './formats'

export type ConversionErrorReason =
  'no-audio-track' | 'not-implemented' | 'unreadable' | 'canceled' | 'unknown'

/**
 * Comlink's built-in thrown-error handling (comlink.js's throwTransferHandler) only
 * copies `message`, `name`, and `stack` across the worker boundary — a plain `Error`
 * gets reconstructed on the far side via `Object.assign(new Error(message), {message,
 * name, stack})`, silently dropping any custom field like `reason` and losing
 * `instanceof ConversionError` entirely. Measured directly: a ConversionError thrown
 * in the worker arrived at the main thread as `instanceof ConversionError === false`
 * with `.reason` gone. `name` is one of the three fields that *does* survive, so the
 * reason is encoded into it and decoded back into a real ConversionError on the other
 * side — see `decodeConversionError` in converter.ts, the main-thread half of this.
 */
const NAME_PREFIX = 'ConversionError:'

export class ConversionError extends Error {
  readonly reason: ConversionErrorReason

  constructor(reason: ConversionErrorReason, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = `${NAME_PREFIX}${reason}`
    this.reason = reason
  }
}

/** True for anything whose `name` carries an encoded ConversionError reason,
 *  whether it survived as a real ConversionError or crossed a Comlink boundary and
 *  was flattened to a plain Error. */
export function isEncodedConversionError(error: unknown): error is Error {
  return error instanceof Error && error.name.startsWith(NAME_PREFIX)
}

/** Reconstructs a real ConversionError from anything isEncodedConversionError
 *  accepted, whether or not it survived the worker boundary intact. */
export function decodeConversionError(error: Error): ConversionError {
  if (error instanceof ConversionError) return error
  const reason = error.name.slice(NAME_PREFIX.length) as ConversionErrorReason
  return new ConversionError(reason, error.message, { cause: error })
}

export interface ConvertProgress {
  /** 0 to 1. Mirrors Conversion.onProgress; reaching 1 doesn't mean done, the
   *  returned promise resolving does. */
  fraction: number
  /** Seconds of input processed so far. */
  processedSeconds: number
}

export interface ConvertResult {
  blob: Blob
  fileName: string
}

export interface ConvertOptions {
  onProgress?: (progress: ConvertProgress) => void
  /** Aborting stops the in-flight conversion (Conversion.cancel()), it does not just
   *  abandon the promise — the underlying encode/mux work actually halts. */
  signal?: AbortSignal
}

/**
 * An AbortSignal that's already aborted never fires its 'abort' event again, so an
 * addEventListener attached after the fact (e.g. once Conversion.init's async setup
 * resolves) would silently never run. Call this at every point where a cancellation
 * that happened during setup needs to be caught, not just once at the very top.
 */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ConversionError('canceled', 'Conversion was canceled.')
  }
}

/**
 * Converts one audio file. `baseName` is the output filename without extension (the
 * caller — file intake, issue #9 — owns relative-path/collision logic; this module
 * only appends the right extension for the target codec).
 */
export async function convertFile(
  file: Blob,
  baseName: string,
  settings: ConversionSettings,
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  throwIfAborted(options.signal)

  const encodable = encodableFormatFor(settings.codec)
  if (!encodable) {
    throw new ConversionError(
      'not-implemented',
      `No browser encoder is wired up yet for ${settings.codec}.`,
    )
  }

  await encodable.ensureReady?.()
  throwIfAborted(options.signal)

  let input: Input
  try {
    input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    if (!(await input.canRead())) {
      throw new ConversionError('unreadable', 'File could not be read.')
    }
  } catch (error) {
    if (error instanceof ConversionError) throw error
    throw new ConversionError('unreadable', 'File could not be read.', { cause: error })
  }

  throwIfAborted(options.signal)

  const audioTrack = await input.getPrimaryAudioTrack()
  if (!audioTrack) {
    throw new ConversionError('no-audio-track', 'No audio track found.')
  }

  const target = new BufferTarget()
  const output = new Output({
    format: encodable.createFormat(),
    target,
  })

  const conversion = await Conversion.init({
    input,
    output,
    video: { discard: true },
    audio: {
      codec: encodable.audioCodec,
      sampleRate: SAMPLE_RATE_HZ[settings.sampleRate],
      bitrate: encodable.resolveBitrate?.(settings),
    },
    // Metadata/cover art passthrough is issue #8's job; omitting `tags` here already
    // makes Conversion default to copying the input's tags (including embedded
    // images) to the output, so keepMetadata's "off" behavior is the only piece left
    // for that issue to add.
  })

  throwIfAborted(options.signal)

  if (!conversion.isValid) {
    const reason = conversion.discardedTracks[0]?.reason
    throw new ConversionError(
      reason === 'no_encodable_target_codec' ? 'not-implemented' : 'unreadable',
      `Could not build a valid ${settings.codec} output for this file.`,
    )
  }

  if (options.onProgress) {
    conversion.onProgress = (fraction, processedTime) =>
      options.onProgress?.({ fraction, processedSeconds: processedTime })
  }

  // No further `await` happens between here and execute() starting, so this listener
  // is the only thing that needs to catch a cancellation from this point on —
  // everything before it is covered by the throwIfAborted checks above.
  const onAbort = () => {
    void conversion.cancel()
  }
  options.signal?.addEventListener('abort', onAbort)

  try {
    await conversion.execute()
  } catch (error) {
    if (error instanceof ConversionCanceledError) {
      throw new ConversionError('canceled', 'Conversion was canceled.', { cause: error })
    }
    throw new ConversionError('unknown', 'Conversion failed.', { cause: error })
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
  }

  if (!target.buffer) {
    throw new ConversionError('unknown', 'Conversion produced no output.')
  }

  return {
    blob: new Blob([target.buffer], { type: encodable.mimeType }),
    fileName: outputFileName(baseName, settings.codec),
  }
}
