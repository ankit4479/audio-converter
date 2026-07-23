// Scratch comparison page for issue #2 (design system port). Renders the token
// set as real utility classes, light and dark side by side, so it can be checked
// against a screenshot of the macOS app. Not part of the shipped app flow — the
// real app only ever follows the OS via prefers-color-scheme (see tokens.css);
// the dark pane here uses the .force-dark override that exists solely for this
// page. Reachable at /?tokens while developing (see main.tsx).

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-8 w-8 rounded-chip border border-border ${className}`} />
      <span className="text-callout text-text-secondary">{label}</span>
    </div>
  )
}

function Pane({ dark }: { dark: boolean }) {
  return (
    <div
      className={`flex-1 space-y-6 bg-surface-page p-6 ${dark ? 'force-dark' : 'force-light'}`}
    >
      <h2 className="text-title font-semibold text-text-primary">
        {dark ? 'Dark' : 'Light'}
      </h2>

      <section className="space-y-2">
        <p className="text-body-sm font-semibold text-text-primary">Accent</p>
        <div className="flex gap-3">
          <Swatch label="accent" className="bg-accent" />
          <Swatch label="hover" className="bg-accent-hover" />
          <Swatch label="success" className="bg-success" />
        </div>
        <button
          type="button"
          className="rounded-chip bg-accent px-4 py-1.5 text-body-sm font-semibold text-accent-ink"
        >
          Choose Files or a Folder
        </button>
      </section>

      <section className="space-y-2">
        <p className="text-body-sm font-semibold text-text-primary">Surfaces & radii</p>
        <div className="flex gap-3">
          <div className="h-16 w-24 rounded-chip border border-border bg-surface" />
          <div className="h-16 w-24 rounded-dropzone border border-border bg-surface" />
          <div className="h-16 w-24 rounded-card border border-border bg-surface" />
        </div>
      </section>

      <section className="space-y-1 rounded-chip border border-border bg-surface p-3">
        <p className="text-body font-semibold text-text-primary">3 songs added</p>
        <p className="text-caption text-text-secondary">42.1 MB, about 12m of music</p>
        <p className="font-mono text-mono-xs text-text-secondary">
          Saving to: /Users/you/Music/Converted (FLAC)
        </p>
      </section>

      <section className="space-y-1">
        <p className="text-body-lg font-semibold text-text-primary">
          Drag songs or folders here
        </p>
        <p className="text-callout text-text-secondary">
          MP3, FLAC, WAV, AAC, ALAC, Opus, and more.
        </p>
      </section>
    </div>
  )
}

export function TokenPreview() {
  return (
    <div className="flex min-h-screen">
      <Pane dark={false} />
      <Pane dark />
    </div>
  )
}
