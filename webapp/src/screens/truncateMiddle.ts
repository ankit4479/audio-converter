/**
 * SwiftUI's `.truncationMode(.middle)` truncates a single line of text against its
 * rendered pixel width, done by AppKit at layout time. CSS `text-overflow: ellipsis`
 * only truncates at the end, and there's no cross-browser middle equivalent - so
 * this does it by character count instead (ConvertView.swift:34-35's folder chip,
 * issue #15's "long paths truncate in the middle, not at the end").
 */
export function truncateMiddle(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const ellipsis = '…'
  const keep = Math.max(maxLength - ellipsis.length, 0)
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return `${text.slice(0, head)}${ellipsis}${tail > 0 ? text.slice(text.length - tail) : ''}`
}
