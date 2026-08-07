/**
 * The "Convert to" control (E2.1, issue #31), shared by every module's settings.
 *
 * It exists as its own component because of one non-obvious rule that must not be
 * re-implemented per module: picking a target is a *navigation* (E1.5, issue #29),
 * and on Windows/Linux Chrome and Firefox a closed native `<select>` fires `change`
 * for every option the arrow keys pass over. Committing on `change` would send a
 * keyboard user to the first neighbouring format and tear the focused control out
 * from under them. So `change` only ever moves the visible value, and the commit
 * waits for a signal that the pick is finished: a pointer selection, Enter, or
 * focus leaving the control.
 *
 * Was inline in SetupView's FormatPickerSection, which made it audio-only.
 */
import { useId, useRef } from 'react'
import { SelectChevron } from '../components/SelectChevron'

export interface FormatOption {
  readonly value: string
  readonly label: string
}

/** A group of options. A single group with no label renders as a flat list rather
 *  than a one-entry `<optgroup>`; audio uses two labelled groups ("Common", "More
 *  Formats"), image has no such split. */
export interface FormatOptionGroup {
  readonly label?: string
  readonly options: readonly FormatOption[]
}

export function FormatSelect({
  label,
  value,
  groups,
  description,
  onValueChange,
  onCommit,
}: {
  label: string
  value: string
  groups: readonly FormatOptionGroup[]
  /** Caption under the select, e.g. audio's "Smaller files. Plays on almost
   *  anything. About 2.4 MB per minute." */
  description?: string
  /** Every change, committed or not, so the visible value always follows the user. */
  onValueChange: (value: string) => void
  /** A finished pick. The shell turns this into a navigation when the conversion
   *  has a page of its own, and ignores it otherwise. */
  onCommit: (value: string) => void
}) {
  const selectId = useId()
  const pickedWithPointer = useRef(false)

  return (
    <div className="space-y-1.5">
      <label htmlFor={selectId} className="text-body-sm font-semibold text-text-primary">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          className="w-full appearance-none rounded-chip border border-border bg-surface p-2 pr-9 text-text-primary"
          value={value}
          onPointerDown={() => {
            pickedWithPointer.current = true
          }}
          onKeyDown={(event) => {
            // Enter closes the dropdown, so it is the keyboard's "this is my
            // choice"; any other key is still browsing.
            if (event.key === 'Enter') onCommit(event.currentTarget.value)
            else pickedWithPointer.current = false
          }}
          onBlur={(event) => onCommit(event.target.value)}
          onChange={(event) => {
            const picked = event.target.value
            onValueChange(picked)
            if (pickedWithPointer.current) {
              pickedWithPointer.current = false
              onCommit(picked)
            }
          }}
        >
          {groups.map((group, index) =>
            group.label === undefined ? (
              <Options key={index} options={group.options} />
            ) : (
              <optgroup key={group.label} label={group.label}>
                <Options options={group.options} />
              </optgroup>
            ),
          )}
        </select>
        <SelectChevron />
      </div>
      {description !== undefined && (
        <p className="text-caption text-text-secondary">{description}</p>
      )}
    </div>
  )
}

function Options({ options }: { options: readonly FormatOption[] }) {
  return (
    <>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </>
  )
}
