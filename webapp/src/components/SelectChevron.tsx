/**
 * Native <select> arrows render however the browser's own UA styling decides to,
 * which doesn't line up with this design system - `appearance-none` on the select
 * strips that, and this SVG replaces it with one whose size and alignment we
 * control. Shared by every select in the app (SetupView's format/quality pickers,
 * ConverterSelect's source picker) so they can't drift apart.
 *
 * Positions itself absolutely, so the select it decorates needs a `relative`
 * wrapper and enough right padding to clear it (`pr-7` at small sizes, `pr-9` on
 * a full-width control).
 */
export function SelectChevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary"
      aria-hidden="true"
    >
      <path
        d="M5 9l7 7 7-7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
