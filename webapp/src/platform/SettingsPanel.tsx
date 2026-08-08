/**
 * Renders a module's `settingsSchema` (E2.1, issue #31; the panel
 * docs/platform-expansion-plan.md section 5.5 specified and #21 declared the field
 * types for, but nothing had built yet).
 *
 * The point of it is that a module ships no settings JSX at all: it declares fields
 * as data - which has to stay true, because a module's code is loaded inside a
 * Worker and cannot import React. Every field kind in SettingField gets exactly one
 * rendering here, so two modules asking for a slider get the same slider.
 *
 * Values are held as a flat `Record<string, unknown>` keyed by `SettingField.key`,
 * which is the shape the module's own settings object already has.
 */
import { useId } from 'react'
import { SelectChevron } from '../components/SelectChevron'
import type { FormatId, SettingField } from './module'

export function SettingsPanel({
  schema,
  values,
  source,
  onChange,
}: {
  schema: readonly SettingField[]
  values: Record<string, unknown>
  /** The page's source format, when it has one - see SettingVisibilityContext. */
  source?: FormatId
  /** Called with the whole next values object, matching how every other settings
   *  surface in this app reports a change. */
  onChange: (values: Record<string, unknown>) => void
}) {
  // Filtered here rather than by the caller, so "which fields apply" stays this
  // component's own concern - a caller that pre-filtered would have to duplicate
  // the { values, source } context shape SettingVisibilityContext already defines.
  const visible = schema.filter(
    (field) => field.visibleIf === undefined || field.visibleIf({ values, source }),
  )
  if (visible.length === 0) return null

  return (
    <div className="space-y-3">
      {visible.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={(value) => onChange({ ...values, [field.key]: value })}
        />
      ))}
    </div>
  )
}

function Field({
  field,
  value,
  onChange,
}: {
  field: SettingField
  value: unknown
  onChange: (value: unknown) => void
}) {
  const id = useId()

  switch (field.kind) {
    case 'select':
      return (
        <Row id={id} label={field.label}>
          <div className="relative">
            <select
              id={id}
              className="appearance-none rounded-chip border border-border bg-surface py-1 pl-2 pr-7 text-text-primary"
              value={String(value ?? '')}
              onChange={(event) => onChange(event.target.value)}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <SelectChevron />
          </div>
        </Row>
      )

    case 'slider':
      return (
        <Row id={id} label={field.label}>
          <span className="flex items-center gap-2">
            <input
              id={id}
              type="range"
              min={field.min}
              max={field.max}
              step={field.step}
              value={Number(value ?? field.min)}
              onChange={(event) => onChange(event.target.valueAsNumber)}
              className="accent-accent"
            />
            {/* The number matters here - "quality 80" is a value people compare
                against other tools, so it can't be left implicit in a handle
                position. */}
            <output htmlFor={id} className="w-8 text-right tabular-nums">
              {Number(value ?? field.min)}
            </output>
          </span>
        </Row>
      )

    case 'toggle':
      return (
        <label htmlFor={id} className="flex items-center gap-2 text-text-primary">
          <input
            id={id}
            type="checkbox"
            role="switch"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
            className="accent-accent"
          />
          {field.label}
        </label>
      )

    case 'color':
      return (
        <Row id={id} label={field.label}>
          <input
            id={id}
            type="color"
            value={typeof value === 'string' ? value : '#ffffff'}
            onChange={(event) => onChange(event.target.value)}
            className="h-7 w-12 rounded-chip border border-border bg-surface"
          />
        </Row>
      )
  }
}

/** The label-left, control-right row the rest of the app's settings already use
 *  (see AudioSettings' LabeledSelect), so a schema-driven panel doesn't look like a
 *  different app. */
function Row({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-text-primary">
        {label}
      </label>
      {children}
    </div>
  )
}
