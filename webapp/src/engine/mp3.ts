/**
 * No browser encodes MP3 natively, so this loads @mediabunny/mp3-encoder's WASM LAME
 * build on demand and resolves our quality tiers to a bitrate it can use.
 *
 * Deviation from the issue's plan, found by reading the package's own source
 * (dist/modules/src/encode.worker.js and index.js) rather than assuming: it only
 * exposes a flat CBR `bitrate` — `init_lame` is compiled from `(channels, sampleRate,
 * bitrate)` and the wrapper never calls LAME's `lame_set_VBR`. True VBR (Codec.swift's
 * V0/V2/V5 presets, ported as-is in codec.ts's mp3QualityScale for documentation and
 * Swift parity) isn't reachable through this path at all. The closest honest
 * approximation is CBR at each preset's own long-documented average bitrate, which
 * keeps the same three-tier size/quality trade-off even though the encoding mode
 * differs. LAME's average bitrates for V0/V2/V5 are well established:
 * https://wiki.hydrogenaud.io (or any LAME documentation) — 245/190/130 kbps.
 */
import { canEncodeAudio } from 'mediabunny'
import type { QualityTier } from './codec'

const MP3_BITRATE_FOR_QUALITY: Readonly<Record<QualityTier, number>> = {
  best: 245_000,
  good: 190_000,
  small: 130_000,
}

export function mp3BitrateForQuality(quality: QualityTier): number {
  return MP3_BITRATE_FOR_QUALITY[quality]
}

let registerPromise: Promise<void> | null = null

/**
 * Registers the WASM LAME encoder, exactly once, only when an MP3 conversion is
 * actually about to happen. The dynamic `import()` is what makes Vite split
 * @mediabunny/mp3-encoder into its own chunk rather than bundling it into the
 * initial page load — converting to any other format never triggers this at all.
 */
export function ensureMp3EncoderRegistered(): Promise<void> {
  registerPromise ??= (async () => {
    // Skip registering over a native encoder, per the package's own recommended
    // pattern - no browser has one today, but this keeps us out of its way if one
    // ever ships.
    if (await canEncodeAudio('mp3')) return
    const { registerMp3Encoder } = await import('@mediabunny/mp3-encoder')
    registerMp3Encoder()
  })()
  return registerPromise
}
