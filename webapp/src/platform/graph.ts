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
const AUDIO_ENCODABLE_TARGETS: readonly CodecId[] = CODEC_IDS.filter(
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

const FORMAT_NODES: readonly FormatNode[] = AUDIO_FORMAT_NODES
const EDGES: readonly ConversionEdge[] = AUDIO_EDGES

const NODES_BY_ID: ReadonlyMap<FormatId, FormatNode> = new Map(
  FORMAT_NODES.map((node) => [node.id, node]),
)

export function formatNode(id: FormatId): FormatNode | undefined {
  return NODES_BY_ID.get(id)
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

/** URL slug for one edge, e.g. edgeToSlug('wav', 'mp3') -> 'wav-to-mp3'. Used to
 *  generate and to parse specific-conversion routes (Expansion 1). */
export function edgeToSlug(from: FormatId, to: FormatId): string {
  return `${from}-to-${to}`
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
