# Platform Expansion Plan: From Audio Converter to a Multi-Category, Private, In-Browser Converter Suite

Status: proposed (2026-07-24). This is the north-star spec for turning the current
audio-only web app into a full converter platform. Phase specs and issue breakdowns hang
off this document. Read `browser-offline-compute-research.md` alongside it for the WASM /
WebCodecs feasibility evidence behind the tech choices here.

---

## 1. The one-sentence thesis

Every file people are nervous about handing to a stranger's server (their camera roll,
their bank statements, their contracts, their recordings) gets converted right in the
browser tab, on their own machine, with nothing uploaded and nothing installed. The
audio converter proves the model. This plan generalizes it to image, video, GIF,
document, and archive conversion on the same rails.

The moat is not "we convert files." Everyone does that. The moat is **"we convert the
files you would never upload, and you can verify in the network tab that we mean it."**

---

## 2. What already exists and what it means for us

The current codebase is far closer to a platform than to a single-purpose app. The folder
structure already separates format-agnostic infrastructure from audio-specific logic:

| Layer | Files | Audio-specific? | Verdict |
|---|---|---|---|
| Intake | `src/intake/*` (file picker, dir scan, drag-drop, dedup) | Only `audioFileTypes.ts` and the accept filter | **Reuse.** Make the accept filter come from the active module. |
| Output | `src/output/*` (File System Access writes, streaming zip, single download, output paths) | No. Writes plain `Blob`s. | **Reuse as-is.** Zero changes needed for new formats. |
| Scheduler | `src/engine/batchScheduler.ts` | No. Runs N workers concurrently. | **Reuse.** Generalize the worker it spawns. |
| Worker RPC | Comlink wrapper in `engine/converter.ts` | Thin | **Reuse the pattern** per engine. |
| Engine | `engine/codec.ts`, `formats.ts`, `convert*.ts`, `mp3/flac/webcodecs.ts` | Yes, fully | **Extract behind a module interface.** |
| Screens | `screens/*` (Landing, Setup, Convert, controller) | Setup UI is audio-shaped | **Split** into a shared converter shell plus per-module settings panels. |
| Deploy | `vercel.json` sets COOP/COEP | No | **Reuse.** `crossOriginIsolated` already on, which unlocks threaded WASM. |

The takeaway: this is an extraction and generalization job, not a rewrite. The riskiest
new surface is per-category WASM engines, and each of those is independently code-split
and lazy-loaded, so a broken image engine can never affect the shipped audio converter.

---

## 3. The core abstraction: `ConverterModule`

Everything hangs off one registry. A module is a self-contained conversion capability for
one category. The platform shell knows nothing about codecs or pixels; it only knows how
to ask a module what it accepts, what settings to render, and how to run.

```ts
// src/platform/module.ts  (new)
export interface ConverterModule {
  id: string                         // 'audio' | 'image' | 'video' | 'gif' | 'pdf' | 'archive'
  category: CategoryId
  label: string

  // What files this module can take in (drives the intake accept filter + validation).
  accepts: (file: FileMeta) => boolean
  inputFormats: FormatId[]
  outputFormats: FormatId[]

  // The settings UI for this module, rendered by the shared shell. A declarative
  // schema (not JSX) so the shell owns layout/telemetry and modules stay pure data.
  settingsSchema: SettingField[]
  defaultSettings: Record<string, unknown>

  // Capability probe. Runs before showing the module as usable. e.g. HEIC needs the
  // libheif chunk to load; some video codecs need runtime WebCodecs detection.
  probe: () => Promise<CapabilityReport>

  // Lazily import the engine (its own worker + convert fn). Code-split boundary:
  // the audio engine's WASM must never appear in the image engine's chunk.
  loadEngine: () => Promise<ConverterEngine>
}

export interface ConverterEngine {
  convert(
    file: Blob,
    baseName: string,
    settings: Record<string, unknown>,
    opts: { onProgress?: (p: ConvertProgress) => void; signal?: AbortSignal },
  ): Promise<ConvertResult>   // ConvertResult already exists in engine/convert.ts
  dispose(): void
}
```

The existing `Converter` class in `engine/converter.ts` becomes the audio module's
`ConverterEngine` with almost no change. `batchScheduler` calls `engine.convert()` exactly
like it calls `converter.convert()` today.

### The conversion graph
Rather than hardcode N pages, model conversions as a directed graph:

- **Nodes** = formats (`mp3`, `heic`, `png`, `pdf`, `mp4`, `zip`, ...).
- **Edges** = a supported `(from, to)` conversion, each owned by exactly one module.

The registry derives everything from this graph: the mega-menu, the home grid, the
per-conversion SEO pages, the "convert to" dropdown inside the widget, and the Cmd+K
search. Add an edge, and the route, the nav entry, and the landing page all appear. This
is the single source of truth that keeps a 60-converter site maintainable.

---

## 4. Category-by-category build plan

Each category below lists: the conversions we ship, the client-side tech, the honest
quality tier (from the earlier feasibility analysis), and the module-specific notes.
Tiers: **A** = clean and fast, **B** = solid, **C** = heavy (big WASM / slow on large
files), **D** = lossy reconstruction (privacy still wins, set expectations).

### 4.1 Audio (shipped, becomes the reference module)
- Conversions: the current set (MP3, AAC, FLAC, WAV, Opus, plus MP4/Video to MP3).
- Tech: Mediabunny + WebCodecs + WASM encoders (mp3, flac). Already built.
- Work: refactor into `modules/audio/` implementing `ConverterModule`. No behavior change.

### 4.2 Image (build first after the refactor)
- Conversions:
  - Native via `<canvas>` / `createImageBitmap` (Tier A): PNG, JPG, **WebP**, AVIF in any
    direction. WebP is a first-class target and source, not an afterthought.
  - HEIC / HEIF decode via `libheif` WASM, then canvas encode (Tier B): HEIC to JPG /
    PNG / WebP. This is the emotional flagship (iPhone photos).
  - JFIF to PNG (Tier A, JFIF is JPEG).
  - Raster to SVG via `potrace` WASM (Tier D): sold explicitly as "vectorize logo / line
    art", never "photo to SVG".
  - SVG to PNG / JPG / WebP (Tier A): render SVG to canvas, export.
- Tech: `jsquash` (WASM codecs for webp/avif/jpeg/png with good control) or plain canvas
  for the native set; `libheif-js` for HEIC; `potrace-wasm` for tracing.
- Notes: images are small and fast, so batch throughput is high. Great first expansion:
  low WASM weight, huge search demand, strongest privacy story after documents.

### 4.3 GIF
- Conversions: Video to GIF (MP4 / WEBM / MOV / AVI to GIF), GIF to MP4, Image to GIF,
  APNG to GIF, GIF to APNG.
- Tech: WebCodecs decode for frames, `gifenc` for encoding; `ffmpeg.wasm` as the fallback
  path for exotic inputs. Tier B/C.
- Notes: shareable and viral, cheap to build once video decode is in place. Ships well
  bundled with video.

### 4.4 Video
- Conversions: Video Converter, MP4 Converter, MOV to MP4, and video to audio (already
  partly in the audio module).
- Tech: WebCodecs first (uses the machine's hardware H.264/H.265 encoder, genuinely
  fast), `ffmpeg.wasm` fallback for containers/codecs WebCodecs won't touch. Tier C.
- Notes: the memory-heavy category. A 2GB 4K file is a real tab-memory problem. Frame the
  UI around clips, stream through the file, show honest progress and a size warning.
  Needs `crossOriginIsolated` (already set) for threaded ffmpeg.

### 4.5 PDF and documents
- Conversions, by honesty tier:
  - Images to PDF, JPG to PDF, HEIC to PDF (Tier A/B): `pdf-lib` assemble.
  - PDF to JPG / PNG (Tier B): `pdf.js` renders each page to canvas.
  - EPUB to PDF (Tier C): EPUB is zipped HTML, render then print-to-PDF.
  - PDF to Word / DOCX, DOCX to PDF, PDF to EPUB (Tier D): layout reconstruction, the
    hardest problem in the whole suite. Ship carefully, or defer. Never produce a
    scrambled result silently.
- Tech: `pdfjs-dist`, `pdf-lib`, optionally `mupdf-wasm` for higher-fidelity rendering.
- Notes: highest privacy value of any category (contracts, statements, medical, tax).
  Even Tier D beats the trust cost of uploading a bank statement. This is the category
  that turns the site from "media tool" into "the private converter for everything."

### 4.6 Archive
- Conversions: ZIP / TAR / GZIP create and extract (Tier A) via `fflate`; 7z and RAR
  **extract only** via `libarchive.js` WASM (RAR create is proprietary, so it is not
  offered, and the UI says so).
- Tech: `fflate` (tiny, fast), `libarchive.js` for the read-only exotic formats.

### 4.7 Explicitly dropped
- **Unit Converter, Time Converter**: removed per direction. No file, no privacy angle,
  off-thesis.
- **DRM ebooks (MOBI/AZW with DRM)**: non-starter, not offered.
- **High-fidelity Office suite conversion** (true .pptx/.xlsx layout): deferred; a
  LibreOffice-WASM payload is a project of its own, revisit only if demand proves it.

---

## 5. Frontend architecture

### 5.1 Information architecture (URLs)
A converter site lives and dies by SEO, and SEO wants one focused, indexable page per
conversion intent. The URL scheme:

```
/                         Home: category grid + search
/audio-converter          Category hub (all audio conversions)
/image-converter          Category hub
/video-converter , /pdf-converter , /gif-converter , /archive-converter
/heic-to-jpg              Specific conversion (SEO landing + working widget)
/mp4-to-mp3
/webp-to-png
/png-to-webp
...one route per graph edge we choose to feature
```

Category hubs and specific-conversion pages are both generated from the conversion graph.
Specific-conversion pages are where Google traffic lands, so each one carries: an H1, a
one-paragraph intro, the live widget pre-configured to that conversion, a "how it works"
block, a privacy statement, an FAQ (with FAQ schema markup), and a "related converters"
strip. This mirrors why FreeConvert ranks, minus the upload.

### 5.2 Rendering strategy (a real decision, see section 9)
The widget must run client-side (that is the whole product). But the marketing shell
around it (H1, copy, FAQ) should be static HTML at crawl time so it ranks. Recommended:
**build-time prerendering (SSG) of every route via `vite-react-ssg`**, with the converter
widget hydrating on the client. This keeps the single React/Vite app, adds static HTML
per route for SEO, and changes nothing about how conversion runs. Pure SPA is simpler to
ship but ranks meaningfully worse, which for this category is a strategic loss.

### 5.3 Navigation (three ways to reach any converter)
1. **Global mega-menu** (the FreeConvert pattern in the reference screenshot): categories
   across the top, conversions grouped beneath, generated from the graph. Present on
   every page so you can jump converter to converter without going home. This is the
   "desktop converter software" feel you asked for.
2. **Command palette (Cmd+K)**: fuzzy search across every conversion ("heic", "mp3",
   "shrink pdf"). Fastest path for repeat users.
3. **In-widget "Convert to" dropdown**: from inside any converter, change the target
   format. If the new target belongs to another module, the shell swaps the engine and
   updates the URL. This is what makes it feel like one app rather than 60 pages.

### 5.4 The home page
- Hero: the privacy USP stated plainly. "Your files never leave your device. No upload,
  no install, no account." A one-line proof nudge ("open your network tab and watch").
- A single prominent search / "what do you want to convert?" input.
- Category grid: Audio, Image, Video, GIF, PDF and Documents, Archive. Each tile counts
  its conversions and links to the hub.
- Popular converters strip (data-driven: HEIC to JPG, MP4 to MP3, WebP to PNG, ...).
- "How it works" and the trust/privacy section (reuse the current landing content, which
  is already privacy-first and on-brand).
- Keep the current shadcn/Tailwind v4 aesthetic. This is an expansion of the existing
  landing page, not a redesign.

### 5.5 The shared converter shell
Every specific-conversion page renders the same shell, parameterized by module:

```
[ Dropzone / file picker ]  ← intake, accept filter from the module
[ Files list + total size ]
[ "Convert to" format select ] [ module settings panel from settingsSchema ]
[ Output-mode notice ]       ← reuse OutputDestination's existing copy
[ Convert button ]
→ progress per file (reuse batchScheduler + ConvertView)
→ done card (reuse revealDestination)
```

The intake, output, progress, and done-card code already exist and are format-agnostic.
The only per-module UI is the settings panel, driven by `settingsSchema`.

---

## 6. Client-side processing architecture ("backend")

There is no server backend for conversion. The "backend" is the browser: workers, WASM,
WebCodecs. Principles:

- **One engine per category, each in its own worker and code-split chunk.** The audio
  WASM never ships in the image page's bundle. `loadEngine()` is the lazy boundary.
- **`batchScheduler` stays the single concurrency authority** across all modules: it
  decides how many workers run at once based on `navigator.hardwareConcurrency`, exactly
  as it does for audio today. Memory-heavy modules (video) can cap their own concurrency
  lower via a module hint.
- **`OutputDestination` stays the single output authority.** Directory writes in
  Chrome/Edge, streaming zip or single download in Safari/Firefox. New formats are just
  new `Blob`s handed to the same `write()`.
- **Capability probing up front.** `module.probe()` runs before a converter is shown as
  usable, so an unsupported browser gets a clear message instead of failing deep inside a
  WASM call (the pattern `engine/formats.ts` already uses with `ensureReady`).
- **Nothing leaves the tab.** No fetch of user bytes, ever. A build-time lint / test can
  assert that no engine module imports `fetch`/XHR with user data, keeping the privacy
  claim mechanically true.

---

## 7. Proposed source layout after the refactor

```
src/
  platform/            NEW  shared, format-agnostic
    module.ts            ConverterModule + ConverterEngine interfaces
    registry.ts          the module registry + conversion graph
    graph.ts             format nodes, edges, lookup, related-conversions
    routes.tsx           route generation from the graph (SSG entry)
    ConverterShell.tsx   the shared widget shell (intake→settings→convert→done)
    SettingsPanel.tsx    renders a module's settingsSchema
    MegaMenu.tsx , CommandPalette.tsx , HomePage.tsx
  intake/              reuse, accept filter parameterized by active module
  output/              reuse unchanged
  engine/              reuse batchScheduler + Comlink pattern; audio bits move out
  modules/             NEW  one folder per category, each code-split
    audio/               the current engine, wrapped as a module
    image/               canvas + jsquash + libheif + potrace
    gif/                 webcodecs + gifenc
    video/               webcodecs + ffmpeg.wasm
    pdf/                 pdfjs-dist + pdf-lib
    archive/             fflate + libarchive.js
  components/ui/        shadcn, reuse
  styles/              reuse
```

---

## 8. Phased roadmap (maps to GitHub milestones)

Each phase is independently shippable and leaves the site fully working. Nothing is
committed until the automated verify + code-review gates pass (per repo workflow).

- **Phase 0, Platform extraction.** Introduce `platform/module.ts`, `registry.ts`,
  `graph.ts`. Wrap the existing audio engine as the first `ConverterModule`. No new
  conversions, no user-visible change. Proves the abstraction against working code.
- **Phase 1, Routing + navigation + home.** Add the router, SSG prerendering, the
  mega-menu, Cmd+K, and the new home page. Audio is still the only module, but the site
  now has its full skeleton and one real category hub.
- **Phase 2, Image module.** Native canvas conversions (incl. WebP both directions),
  then HEIC via libheif, then SVG rasterize and raster-to-SVG tracing. Highest ratio of
  demand to effort.
- **Phase 3, PDF and documents.** Images to PDF, PDF to image first (Tier A/B), then the
  Tier D reconstructions behind clear expectations. The category that widens the moat.
- **Phase 4, GIF + Video.** Shared WebCodecs decode foundation; GIF first (cheap), then
  video transcode with memory-aware framing.
- **Phase 5, Archive.** fflate zip/tar/gz, then libarchive.js extract-only for 7z/rar.
- **Phase 6, Polish + SEO depth.** FAQ schema, related-converter linking, per-page copy,
  Lighthouse and Core Web Vitals pass, sitemap generation from the graph.

Ordering rationale: privacy value and effort-to-demand ratio, not format similarity.
Image and PDF are the strongest wedges and come before the heavier media work.

---

## 9. Decisions (locked 2026-07-24)

1. **Rendering strategy**: SSG prerender per route via `vite-react-ssg`. Every route
   ships static HTML for crawlers; the converter widget hydrates client-side. Conversion
   still runs entirely in the browser. **Locked.**
2. **First category after platform work**: Image (Phase 2), for lightest WASM weight and
   highest demand-to-effort, WebP both directions plus HEIC. **Locked.**
3. **Repo shape**: one Vite app. The native Swift app and the webapp keep coexisting in
   this repo; the expansion is webapp-only. **Locked.**
4. **Router**: `react-router` v7 (default; revisit only if SSG integration favors
   another). Minor, not blocking.
5. **Brand and domain**: pending. Name candidates proposed; awaiting selection before the
   home hero and SEO title tags are finalized. Phase 0 (internal extraction) does not
   depend on this and can start first.

---

## 10. Guardrails carried from the current app

- Privacy is the brand. Never ship a path that uploads user bytes. Assert it in tests.
- Never ship a Tier D converter that fails silently. A mangled result does more brand
  damage than not shipping the tool.
- Every WASM engine is lazy and code-split. The initial page load stays light; a heavy
  engine loads only when its converter is actually used.
- Reuse before building: intake, output, scheduler, and the shell are shared. A new
  module is an engine plus a settings schema, nothing more.
```
