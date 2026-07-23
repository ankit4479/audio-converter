# Browser-based offline compute: research reference

Source: deep-research workflow run 2026-07-13 (run ID `wf_ba687d36-d65`, 110 agents,
~3.57M tokens, 27 sources fetched, 124 claims extracted, 25 adversarially verified).
Original question scope: client-side audio format conversion for the Audio Converter
web app. Findings below are written broadly because the underlying platform facts
(WebCodecs, WASM, worker pools) apply to any offline, no-upload browser app — not just
audio.

Every claim below is tagged:
- **[VERIFIED]** — survived 3-vote adversarial verification (2/3+ agreement) against a
  primary or independently-corroborated source. Cited.
- **[REJECTED]** — proposed, then refuted 0-3 or 1-2 on verification. Listed so it
  doesn't get re-asserted by mistake in a future session.
- **[GENERAL KNOWLEDGE]** — standard, well-documented platform behavior, not run through
  adversarial verification because it wasn't controversial enough to need it. Treat as
  reliable but not source-audited to the same bar as VERIFIED items.
- **[OPEN]** — the research round could not confirm this either way. Needs direct
  testing (`isConfigSupported()`, profiling) before relying on it.

## The core decision: WASM vs. WebGL/WebGPU vs. WebCodecs

This came up because the original idea was "use GPU/WebGL to make conversion feel
instant." That instinct is right for the wrong reason — the actual mechanism is:

- **WebCodecs API** — direct JS access to the browser/OS's native hardware media
  codecs (the same encoders/decoders a native app would call). This is the closest
  thing to "instant" because it's not emulation, it's the real hardware path. Use this
  first for any audio/video encode or decode.
- **WebAssembly (WASM)** — compiled C/C++/Rust codec libraries running in-browser at
  near-native (but not hardware-accelerated) CPU speed. Use this only to fill gaps
  WebCodecs doesn't cover (e.g. MP3 encoding — see below). Runs in a Web Worker so it
  doesn't block the UI thread.
- **WebGL / WebGPU (GPU compute)** — parallel data-crunching on the GPU. **Not useful
  for codec/format conversion** — audio and video encoders are inherently sequential,
  bitstream-oriented processes, not the kind of massively-parallel, independent-pixel
  workload GPUs are built for. GPU compute is the right tool for a *different* class of
  future app: spectral/FFT analysis, waveform rendering, convolution reverb, any
  per-sample DSP that's independent across samples, or visual output (the sound-reactor
  visuals project). Don't reach for WebGL/WebGPU on a format-conversion app; do reach
  for it on a DSP-heavy or visualization-heavy one. [GENERAL KNOWLEDGE — this is a
  structural fact about how encoders and GPUs work, not something that needed
  adversarial fact-checking.]

## WebCodecs API

- **[VERIFIED]** The spec explicitly does not mandate support for any codec:
  "This specification does not specify or require any particular codec or method of
  encoding or decoding." Every `AudioEncoder`/`AudioDecoder`/`VideoDecoder` config note
  says the same. Applications must call `isConfigSupported()` at runtime — never assume
  support from documentation or from the API's mere existence.
  Sources: [W3C spec](https://www.w3.org/TR/webcodecs/),
  [MDN WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- **[VERIFIED]** Chrome and Edge have had full WebCodecs support since v94.
  Source: [caniuse.com/webcodecs](https://caniuse.com/webcodecs)
- **[VERIFIED]** Opus is the best-supported WebCodecs encode target: 96.1%
  encoder / 96.5% decoder support across browsers, and is MDN's explicit recommended
  default for "most WebCodecs audio encoding use cases."
  Source: [MDN Codec Selection](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection)
- **[VERIFIED]** MP3 has **0% native WebCodecs encoder support in any major browser**.
  Decode is broadly supported (96.5%), but encoding to MP3 always requires a bundled
  WASM encoder (typically a WASM build of LAME), regardless of which library or
  approach is used. This is a browser-platform gap, not a library limitation — it
  applies even to WebCodecs-first libraries like Mediabunny.
  Source: same as above, corroborated by
  [Mediabunny's own docs](https://mediabunny.dev/guide/supported-formats-and-codecs)
- **[OPEN]** AAC and FLAC support matrices across Chrome/Safari/Firefox — several
  specific claims were proposed and rejected on verification (both an "AAC not
  supported in Firefox, universal on Safari 26+" claim and a "Chrome doesn't support
  AAC except via platform decoders" claim were refuted 0-3). Do not assume either
  direction. Test directly with `isConfigSupported()` against target browser versions
  before committing to AAC or FLAC as an output format.
- **[OPEN]** Whether WebCodecs actually invokes hardware acceleration for a given
  codec on a given browser/OS. The spec *allows* hardware acceleration but doesn't
  guarantee it, and two proposed claims asserting hardware acceleration as a general
  property were both rejected (0-3) for overreaching what the sources actually say.
  This needs direct engineering verification — profiling CPU/GPU usage or battery
  draw, `chrome://media-internals`, WebKit logging — not reliance on docs.
- **[REJECTED]** "AAC encoding/decoding is not supported in Firefox on any platform,
  and is universally supported on Safari 26+." (0-3)
- **[REJECTED]** "Chrome/Chromium does not support AAC audio codec except when it
  comes from platform-provided decoders." (0-3)
- **[REJECTED]** "Safari only reached full WebCodecs support in version 26.0; versions
  16.4-18.7 have only partial support." Treat exact Safari version cutoffs as
  unconfirmed — re-check caniuse.com directly. (0-3)
- **[REJECTED]** "WebCodecs allows encoding and decoding using hardware acceleration"
  as a flat general statement, and a claimed spec-level `HardwareAcceleration` enum.
  Both rejected as overreach. (0-3 each)

## ffmpeg.wasm — treat as fallback, not primary engine

- **[VERIFIED]** ffmpeg.wasm's own official benchmark (1MB WebM→MP4, 8-core i5, Chrome
  116, ffmpeg.wasm v0.12.3): native FFmpeg took 5.2s; the single-threaded WASM build
  took 128.8s (~25x slower); the multi-threaded `core-mt` build (SharedArrayBuffer +
  pthreads) took 60.4s (~11.6x slower than native, despite roughly halving the
  single-thread time). The project's own docs state it "won't perform as good as
  FFmpeg as it is not fully optimized at the moment."
  Source: [ffmpeg.wasm performance docs](https://ffmpegwasm.netlify.app/docs/performance/)
  — note: test conditions are ~2023-era, so treat as directionally reliable, not a
  precise current-day figure.
- **[VERIFIED]** Multi-threading requires `SharedArrayBuffer`, which requires serving
  the page with COOP/COEP cross-origin-isolation headers — this breaks loading any
  cross-origin resource (fonts, images, third-party embeds) unless they also send
  CORP/CORS headers. Real deployment friction for a production app.
- **[VERIFIED]** FFmpeg licensing: LGPL v2.1-or-later by default, but the entire build
  becomes GPL if any optional GPL-covered component/optimization is enabled. FFmpeg is
  "not available under any other licensing terms, especially not proprietary/commercial
  ones, not even in exchange for payment" — there is no way to pay to escape LGPL/GPL
  obligations. Source: [ffmpeg.org/legal.html](https://ffmpeg.org/legal.html)
  (their own authoritative page).
- **Real risk found in sourcing**: a live GitHub issue
  ([ffmpegwasm/ffmpeg.wasm#902](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/902))
  reports that ffmpeg.wasm's *prebuilt* `@ffmpeg/core` / `@ffmpeg/core-mt` packages are
  compiled with `--enable-gpl`, making them GPL — not LGPL — despite the JS wrapper
  itself being MIT-licensed. Anyone using the default prebuilt package for a commercial,
  closed-source distributed app may be unknowingly GPL-tainted. Verify the exact build
  configuration before shipping if ffmpeg.wasm is used at all.

**Conclusion: use ffmpeg.wasm only as a last-resort fallback for a format neither
WebCodecs nor a WebCodecs-first library can cover, and audit the exact build's license
before distributing.**

## Mediabunny — recommended primary engine

- **[VERIFIED]** Mediabunny (2024-2026) is a WebCodecs-first JS/TS library for
  reading, writing, and converting audio/video entirely in-browser. Implemented from
  scratch in pure TypeScript, zero dependencies, built as multiplexers/demultiplexers
  wired to WebCodecs abstractions, with pipelined and lazy processing for performance
  and low memory use. Explicitly positioned by its authors as a faster alternative to
  ffmpeg.wasm. MPL-2.0 licensed (materially cleaner for commercial distribution than
  ffmpeg.wasm's LGPL/GPL). ~5.4-5.9k GitHub stars, actively maintained, independently
  used/endorsed by Remotion. Sources: [mediabunny.dev](https://mediabunny.dev/),
  [github.com/Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny)
- **[VERIFIED]** Mediabunny inherits WebCodecs' per-browser codec variability — it
  cannot guarantee codec support on its own, only PCM is natively guaranteed. For gaps
  WebCodecs leaves entirely (MP3 encoding, which has 0% support anywhere), it ships
  separate **opt-in WASM extension packages** rather than pretending WebCodecs solves
  it — e.g. `@mediabunny/mp3-encoder` is a WASM build of LAME. This is architecturally
  the right shape: hardware path by default, WASM only for the specific documented gap.
  Source: [mediabunny.dev/guide/supported-formats-and-codecs](https://mediabunny.dev/guide/supported-formats-and-codecs)
- **[REJECTED]** The framing "Mediabunny's architecture is hardware-accelerated via
  WebCodecs *rather than* a WASM-based implementation" was rejected (0-3) — it does
  ship WASM extensions for MP3/FLAC encode, so the correct framing is WebCodecs-first
  with WASM fallback for specific gaps, not WebCodecs-exclusive.
- **[REJECTED]** Mediabunny's specific quantified throughput claims vs. ffmpeg.wasm
  (e.g. "804 fps vs 12.0 fps," "862 ops/s vs 1.83 ops/s") did not survive independent
  verification — these are vendor-authored benchmark numbers from a single self-reported
  test. The architectural reason to expect Mediabunny is faster (real hardware codec
  access vs. WASM software emulation) is sound; the exact multiplier is not confirmed.
  Benchmark on your own representative files before quoting a number externally.
- **[REJECTED]** The specific "25+ codecs, hardware-accelerated for all of them"
  claim from the GitHub README was rejected as overreach — codec support is still
  gated by what each browser's WebCodecs implementation actually supports (see the
  AAC/FLAC [OPEN] item above).

## Other WASM codec libraries (fetched, not yet verified — [OPEN])

Sources were fetched but claims from these did not make the verification cut this
round. Listed for follow-up if a future project needs a specific format gap Mediabunny
doesn't cover:
- [eshaz/wasm-audio-decoders](https://github.com/eshaz/wasm-audio-decoders) — WASM
  decoders for MP3 (via mpg123), Opus, Vorbis, FLAC.
- [arseneyr/wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders) —
  WASM encoders, alternative to rolling your own LAME build.
- libopus-wasm — a WASM Opus implementation, relevant if you need Opus encode/decode
  outside of WebCodecs (e.g. targeting a browser without WebCodecs Opus support).

## Resource detection and Web Worker pool sizing [GENERAL KNOWLEDGE]

Not adversarially verified this round (the research budget went to the codec/licensing
questions instead), but this is standard, stable web-platform behavior, not a
fast-moving or disputed area:

- `navigator.deviceMemory` — **Chromium-only**. Never implemented in Safari, never in
  Firefox. Don't build resource-detection logic around it for a macOS-first
  (Safari-inclusive) app.
- `navigator.hardwareConcurrency` — supported everywhere, but it's a *hint*, not
  ground truth. Browsers may deliberately misreport it for fingerprinting resistance.
  Safari on macOS is known to cap the reported value below the true core count in some
  versions.
- **The right mental model is a worker pool + queue, not a batch-size ceiling.** Don't
  try to compute "your system can convert N tracks at once" and show that number to the
  user — that's solving the wrong problem and will guess wrong on edge-case hardware.
  Instead: spin up a small persistent pool of Web Workers, sized to
  `hardwareConcurrency - 1` (leave a core for the UI thread), capped at a sane ceiling
  (~6-8) since each worker loading its own codec/WASM instance costs real memory. Feed
  the pool from a queue of however many files the user dropped in — 20 or 200. The pool
  only ever holds pool-size files in memory at once regardless of queue length, so there
  is no hard batch limit to compute or explain, just a progress bar that fills at a rate
  proportional to the hardware.
- A more sophisticated alternative for future projects: runtime micro-benchmarking
  (spin up workers, time actual throughput, binary-search to the real usable
  parallelism) instead of trusting `hardwareConcurrency` outright — see Eli Grey's
  "Core Estimator" pattern (fetched but not verified this round:
  [eligrey.com/blog/cpu-core-estimation-with-javascript](https://eligrey.com/blog/cpu-core-estimation-with-javascript)).
  Likely overkill for a v1; static `hardwareConcurrency`-based sizing with a queue is
  good enough to start.
- Squoosh (Google's in-browser image codec tool) is the closest real-world precedent
  for this pattern — it runs each codec in its own Web Worker via a worker pool so WASM
  codec execution never blocks the main thread. Fetched but not independently verified
  this round: [web.dev/blog/introducing-libsquoosh](https://web.dev/blog/introducing-libsquoosh),
  [github.com/jamsinclair/jSquash](https://github.com/jamsinclair/jSquash) (a
  WebCodecs/WASM image-codec toolkit modeled on Squoosh's approach — worth a direct
  look for a future project since it's the same architecture pattern, just for images).

## Stack recommendation (Audio Converter web app)

1. **Mediabunny** as the core conversion engine.
2. **MP3 as default output** (per product decision) — routes through Mediabunny's
   bundled WASM LAME extension. Since this is the default/hot path (not an edge case),
   include it in the initial bundle rather than lazy-loading it.
3. Other codecs (Opus, AAC, FLAC, WAV) offered as user-selectable — Opus gets the fast
   hardware WebCodecs path; AAC/FLAC need runtime `isConfigSupported()` checks before
   being offered, since their cross-browser support isn't confirmed.
4. Skip ffmpeg.wasm entirely unless a specific unsupported format forces a fallback —
   and if so, audit the exact build's license before distributing.
5. Web Worker pool (`hardwareConcurrency - 1`, capped ~6-8) pulling from a queue, no
   user-facing batch-size ceiling.
6. No WebGL/WebGPU for the conversion path — reserve GPU compute for future
   visualization/DSP-heavy projects (spectral analysis, waveform rendering), where the
   workload is actually parallel.

## Full source list

WebCodecs / codec support:
[MDN Codec Selection](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection),
[MDN Audio codecs guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs),
[caniuse.com/webcodecs](https://caniuse.com/webcodecs),
[MDN WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API),
[W3C WebCodecs spec](https://www.w3.org/TR/webcodecs/),
[webcodecsfundamentals.org](https://webcodecsfundamentals.org/audio/intro/)

ffmpeg.wasm:
[Performance docs](https://ffmpegwasm.netlify.app/docs/performance/),
[GitHub issue #902 (licensing)](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/902),
[ffmpeg.org/legal.html](https://ffmpeg.org/legal.html),
[DeepWiki multi-threading](https://deepwiki.com/ffmpegwasm/ffmpeg.wasm/4.4-multi-threading),
[Discussion #576 (COOP/COEP)](https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/576),
[Issue #597 (threading instability)](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/597)

Mediabunny:
[mediabunny.dev](https://mediabunny.dev/),
[GitHub](https://github.com/Vanilagy/mediabunny),
[Supported formats/codecs](https://mediabunny.dev/guide/supported-formats-and-codecs),
[MP3 encoder extension](https://mediabunny.dev/guide/extensions/mp3-encoder)

Worker pools / resource detection:
[MDN hardwareConcurrency](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency),
[MDN deviceMemory](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory),
[caniuse deviceMemory](https://caniuse.com/mdn-api_navigator_devicememory),
[Eli Grey — CPU core estimation](https://eligrey.com/blog/cpu-core-estimation-with-javascript)

Real-world architecture precedent:
[Introducing libSquoosh](https://web.dev/blog/introducing-libsquoosh),
[jSquash](https://github.com/jamsinclair/jSquash),
[WebCodecs vs ffmpeg.wasm (blog)](https://burnsub.com/blog/webcodecs-vs-ffmpeg-wasm/)

Other WASM codec libraries:
[wasm-audio-decoders](https://github.com/eshaz/wasm-audio-decoders),
[wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders)
