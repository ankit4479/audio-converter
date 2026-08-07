/**
 * The conversion graph (E0.2, issue #22): formats are nodes, supported conversions
 * are edges, each owned by exactly one module. This is the single source of truth
 * the mega-menu, home category grid, SEO pages, and Cmd+K search all generate from
 * later (Expansion 1) - see docs/platform-expansion-plan.md section 3.
 *
 * Seeded with today's audio conversions only (this issue's scope). Node ids and
 * labels are sourced from engine/codec.ts's CODEC_IDS/CODECS, not from the raw
 * input file extensions in intake/audioFileTypes.ts: the app decodes any accepted
 * audio file regardless of its source codec (Mediabunny's demuxer, not a per-
 * extension table), so there is no reliable "this input format decodes" fact to
 * model per extension. A `from` node here means "the source file's nominal
 * format", used for SEO/labeling (an "X to Y" page), not a decode guarantee - the
 * same optimistic-accept, per-file-failure philosophy audioFileTypes.ts already
 * documents applies to whatever `from` node a page names.
 */
import { CODEC_IDS, CODECS, type CodecId } from '../engine/codec'
import { ENCODABLE_FORMATS } from '../engine/formats'
import type { CategoryId, FormatId } from './module'

export interface FormatNode {
  readonly id: FormatId
  readonly label: string
  readonly extensions: readonly string[]
  /** Undefined where no MIME type is established anywhere in the codebase (the
   *  not-yet-implemented codecs: alac, wavpack, vorbis, wma have none, per
   *  engine/formats.ts's ENCODABLE_FORMATS). */
  readonly mime?: string
  readonly category: CategoryId
}

export interface ConversionEdge {
  readonly from: FormatId
  readonly to: FormatId
  readonly moduleId: string
}

// aiff has no ENCODABLE_FORMATS entry (convert.ts writes it via a hand-rolled path,
// aiff.ts, bypassing Mediabunny's OutputFormat table entirely - see formats.ts's
// header comment) so it has no mimeType there either. audio/aiff is the type's
// IANA-registered MIME type, not derived from this codebase.
const MIME_OVERRIDES: Partial<Record<CodecId, string>> = { aiff: 'audio/aiff' }

function mimeFor(id: CodecId): string | undefined {
  return ENCODABLE_FORMATS[id]?.mimeType ?? MIME_OVERRIDES[id]
}

const AUDIO_FORMAT_NODES: readonly FormatNode[] = CODEC_IDS.map((id) => ({
  id,
  label: CODECS[id].label,
  extensions: [CODECS[id].fileExtension],
  mime: mimeFor(id),
  category: 'audio' as const,
}))

// Today's actually-working output targets: ENCODABLE_FORMATS has a real encoder
// (mp3/aac/flac/wav/opus), or the codec has its own hand-rolled writer (aiff).
// alac/wavpack/vorbis/wma remain unimplemented (see formats.ts, codec.ts's
// 'unsupportedInBrowser' availability) and are deliberately excluded as `to`
// targets, though they still exist as FormatNodes above (e.g. as a `from` label).
// Exported so modules/audio (#23) can build its outputFormats from the same
// source of truth rather than re-deriving this filter a second time.
export const AUDIO_ENCODABLE_TARGETS: readonly CodecId[] = CODEC_IDS.filter(
  (id) => id === 'aiff' || ENCODABLE_FORMATS[id] !== null,
)

const AUDIO_MODULE_ID = 'audio'

const AUDIO_EDGES: readonly ConversionEdge[] = CODEC_IDS.flatMap((from) =>
  AUDIO_ENCODABLE_TARGETS.filter((to) => to !== from).map((to) => ({
    from,
    to,
    moduleId: AUDIO_MODULE_ID,
  })),
)

const IMAGE_MODULE_ID = 'image'

/**
 * Image formats. The browser is the codec here (createImageBitmap to decode,
 * OffscreenCanvas or a WASM encoder to encode - see modules/image/), so there is no
 * codec table to derive these from the way audio is derived from engine/codec.ts.
 *
 * Split into two tables since E2.2 (issue #32), because HEIC is asymmetric: it can be
 * read but this app deliberately never writes it. Anything encodable is both a source
 * and a target; a decode-only format is a source only, and the edge generation below
 * is what enforces that rather than a filter each caller has to remember.
 *
 * The first extension is the canonical one, used for output file names
 * (output/outputPath.ts); any others are aliases that only ever appear as input,
 * which is why 'jpeg' is listed but never produced.
 */
const IMAGE_ENCODABLE_FORMATS = [
  { id: 'png', label: 'PNG', extensions: ['png'], mime: 'image/png' },
  { id: 'jpg', label: 'JPEG', extensions: ['jpg', 'jpeg'], mime: 'image/jpeg' },
  { id: 'webp', label: 'WebP', extensions: ['webp'], mime: 'image/webp' },
  { id: 'avif', label: 'AVIF', extensions: ['avif'], mime: 'image/avif' },
] as const

/**
 * Formats the image module can read but never write (E2.2, issue #32). HEIC encode is
 * an explicit non-goal: the whole point is getting a phone photo into a format
 * everything else can already open.
 *
 * heic and heif are separate nodes rather than one with two extensions because they
 * are separate search intents - people look for "heic to jpg" and "heif to jpg" - and
 * one node per intent is what gives each its own indexable page.
 */
const IMAGE_DECODE_ONLY_FORMATS = [
  { id: 'heic', label: 'HEIC', extensions: ['heic'], mime: 'image/heic' },
  { id: 'heif', label: 'HEIF', extensions: ['heif'], mime: 'image/heif' },
] as const

/** The formats the image module can produce, as a closed union rather than a plain
 *  FormatId, so a format added to the encodable table is a compile error everywhere
 *  the module enumerates targets (its MIME/extension/alpha tables) until handled. */
export type ImageFormatId = (typeof IMAGE_ENCODABLE_FORMATS)[number]['id']

/** Every format the image module can read, encodable or not. */
export type ImageInputFormatId =
  ImageFormatId | (typeof IMAGE_DECODE_ONLY_FORMATS)[number]['id']

/** Exported so modules/image builds its input/output lists from these tables rather
 *  than repeating them - the same reason AUDIO_ENCODABLE_TARGETS is exported above. A
 *  second, hand-written copy could drift out of step with the graph, and then
 *  outputExtension() would return undefined for a target the module still offered and
 *  ConverterShell would name output files with the bare format id. */
export const IMAGE_FORMAT_IDS: readonly ImageFormatId[] = IMAGE_ENCODABLE_FORMATS.map(
  (format) => format.id,
)

export const IMAGE_INPUT_FORMAT_IDS: readonly ImageInputFormatId[] = [
  ...IMAGE_FORMAT_IDS,
  ...IMAGE_DECODE_ONLY_FORMATS.map((format) => format.id),
]

const IMAGE_FORMAT_NODES: readonly FormatNode[] = [
  ...IMAGE_ENCODABLE_FORMATS,
  ...IMAGE_DECODE_ONLY_FORMATS,
].map((format) => ({ ...format, category: 'image' as const }))

/** Decode-only sources reach JPG, PNG, and WebP - the three formats that are
 *  universally openable, and the scope #32 defined. They deliberately do not reach
 *  AVIF, unlike every encodable source: see that issue's closing note. */
const DECODE_ONLY_TARGETS: readonly ImageFormatId[] = ['jpg', 'png', 'webp']

const IMAGE_EDGES: readonly ConversionEdge[] = [
  ...IMAGE_ENCODABLE_FORMATS.flatMap((from) =>
    IMAGE_FORMAT_IDS.filter((to) => to !== from.id).map((to) => ({
      from: from.id,
      to,
      moduleId: IMAGE_MODULE_ID,
    })),
  ),
  ...IMAGE_DECODE_ONLY_FORMATS.flatMap((from) =>
    DECODE_ONLY_TARGETS.map((to) => ({
      from: from.id,
      to,
      moduleId: IMAGE_MODULE_ID,
    })),
  ),
]

const FORMAT_NODES: readonly FormatNode[] = [...AUDIO_FORMAT_NODES, ...IMAGE_FORMAT_NODES]
const EDGES: readonly ConversionEdge[] = [...AUDIO_EDGES, ...IMAGE_EDGES]

const NODES_BY_ID: ReadonlyMap<FormatId, FormatNode> = new Map(
  FORMAT_NODES.map((node) => [node.id, node]),
)

export function formatNode(id: FormatId): FormatNode | undefined {
  return NODES_BY_ID.get(id)
}

/** The extension output files of this format get, e.g. 'mp3' or 'jpg'. The first
 *  of a node's extensions is the canonical one; the rest are input-only aliases
 *  ('jpeg'), so this is what output/outputPath.ts names files with. */
export function outputExtension(id: FormatId): string | undefined {
  return formatNode(id)?.extensions[0]
}

export function allFormatNodes(): readonly FormatNode[] {
  return FORMAT_NODES
}

export function allEdges(): readonly ConversionEdge[] {
  return EDGES
}

export function edgesForCategory(category: CategoryId): readonly ConversionEdge[] {
  return EDGES.filter((edge) => formatNode(edge.from)?.category === category)
}

/** Every category with at least one real conversion - most categories in
 *  CategoryId are scaffolding with no module yet (see module.ts), so most of
 *  them have zero edges. Shared by react-router.config.ts/routes.ts (which
 *  routes to generate) and MegaMenu.tsx (which nav columns to show), so the
 *  three can never disagree about what's actually live. */
export function categoriesWithConversions(): readonly CategoryId[] {
  const categories = new Set(FORMAT_NODES.map((node) => node.category))
  return [...categories].filter((category) => edgesForCategory(category).length > 0)
}

export function moduleForEdge(from: FormatId, to: FormatId): string | undefined {
  return EDGES.find((edge) => edge.from === from && edge.to === to)?.moduleId
}

/** Every other format connected to the given one, either as its source or its
 *  target across any edge - the data a "related conversions" page strip needs. */
export function relatedConversions(id: FormatId): readonly FormatId[] {
  const related = new Set<FormatId>()
  for (const edge of EDGES) {
    if (edge.from === id) related.add(edge.to)
    else if (edge.to === id) related.add(edge.from)
  }
  return [...related]
}

/** Path of a category's hub page, e.g. hubPath('audio') -> '/audio-converter'.
 *  The literal was being spelled out separately in routes.ts,
 *  react-router.config.ts, MegaMenu, and HomePage; all four now call this, so a
 *  hub link can't point somewhere the route table doesn't generate. */
export function hubPath(category: CategoryId): string {
  return `/${category}-converter`
}

/** Inverse of hubPath, for the single hub route component recovering which
 *  category it is rendering from the URL (the same trick routes/conversion.tsx
 *  uses with slugToEdge - routes.ts generates one literal path per category, so
 *  there is no route param to read). Returns undefined for anything that isn't a
 *  live category's hub path. */
export function categoryForHubPath(path: string): CategoryId | undefined {
  const slug = path.replace(/^\/+|\/+$/g, '')
  return categoriesWithConversions().find((category) => `${category}-converter` === slug)
}

/** URL slug for one edge, e.g. edgeToSlug('wav', 'mp3') -> 'wav-to-mp3'. Used to
 *  generate and to parse specific-conversion routes (Expansion 1). */
export function edgeToSlug(from: FormatId, to: FormatId): string {
  return `${from}-to-${to}`
}

/** Human-readable label for an edge, e.g. "WAV to MP3" - shared by the Cmd+K
 *  palette (#27) and the home page's search/popular strip (#28) so the exact
 *  phrasing can't drift between the two. */
export function edgeLabel(from: FormatId, to: FormatId): string {
  return `${formatNode(from)?.label ?? from} to ${formatNode(to)?.label ?? to}`
}

/** Inverse of edgeToSlug. Returns undefined for a slug that isn't a real edge
 *  (unknown ids, or a valid-looking pair with no supported conversion between
 *  them) so a route handler can 404 rather than render a page for a made-up pair. */
export function slugToEdge(slug: string): ConversionEdge | undefined {
  const match = /^(.+)-to-(.+)$/.exec(slug)
  if (!match) return undefined
  const [, from, to] = match
  return EDGES.find((edge) => edge.from === from && edge.to === to)
}
