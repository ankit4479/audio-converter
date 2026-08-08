# Spike: is Vorbis encoding viable in the browser? (issue #12)

Time-boxed investigation. Decision below; do not re-litigate without new information.

## Decision: yes — `wasm-media-encoders`

A maintained, MIT-licensed WASM Ogg Vorbis encoder exists and fits this app's
existing lazy-WASM-encoder pattern (the same shape as Mediabunny's `@mediabunny/mp3-encoder`
and the jSquash WASM image encoders already in use).

## Findings, against the issue's four questions

**Is there a maintained Vorbis encoder WASM build with a compatible license?**
Yes — [`wasm-media-encoders`](https://github.com/arseneyr/wasm-media-encoders) (npm:
`wasm-media-encoders`, MIT). Ships a real libvorbis build compiled to WASM, plus MP3
(LAME) in the same package. Not archived; last push 2025-08-07, last tagged release
0.7.0 (2024-05-24). 56 stars, 8 open issues. Slow release cadence is expected here —
it wraps a codec spec (Vorbis) that has not changed in over a decade, so infrequent
releases read as "stable," not "abandoned." Verified via the GitHub API directly
(`pushed_at`, `archived: false`), not just the README.

**What does it add to the bundle, lazy loaded?**
158 KiB gzipped (3.3 KiB JS + 440 KiB WASM, per the package's own build output) —
comparable to the other lazy-loaded WASM codec extensions already in this app (jSquash's
AVIF/WebP encoders in the image module). Ships a dual ESM/CJS build with a proper
`exports` map and the `.wasm` file as a separate importable asset
(`wasm-media-encoders/wasm/ogg.wasm`), which is the same lazy-import shape Vite already
handles for the image module's WASM encoders — confirmed by reading the published
package's `exports` field directly, not the README's claims about it.

**Can it hit the app's q8 / q6 / q4 quality tiers?**
Yes, exactly. The encoder takes Vorbis's native VBR quality scale (-1.0 worst to 10.0
best), which is the same scale `vorbisQualityScale()` in `engine/codec.ts:254-256`
already computes for a native ffmpeg-style path (`best → 8`, `good → 6`, `small → 4`).
No new quality-mapping logic needed — the existing function's output plugs straight in.

**How does encode speed compare to the MP3 path?**
Not benchmarked this round — both are WASM-compiled reference encoders (libvorbis vs.
LAME) run the same way (main-thread call inside a Web Worker), so there's no
architectural reason to expect a meaningfully different profile, but this should be
confirmed against this app's own worker-pool setup once actually wired in, not assumed.

## Outcome

Vorbis gets an implementation issue (see the codebase's next issue after this spike),
not a "join #13" fallback. Unlike ALAC/WavPack/WMA, which have no viable open-source
browser-side encoder at all, Vorbis has one that is small, real, license-clean, and
requires no new quality-mapping design.
