import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SettingField } from './module'
import { SettingsPanel } from './SettingsPanel'

// Tested against a fake schema rather than a real module's, so the panel is checked
// for rendering the contract (platform/module.ts's SettingField) rather than one
// module's current field list.
const SCHEMA: readonly SettingField[] = [
  {
    kind: 'select',
    key: 'format',
    label: 'Format',
    options: [
      { value: 'png', label: 'PNG' },
      { value: 'webp', label: 'WebP' },
    ],
  },
  { kind: 'slider', key: 'quality', label: 'Quality', min: 1, max: 100, step: 1 },
  { kind: 'toggle', key: 'strip', label: 'Strip metadata' },
  { kind: 'color', key: 'background', label: 'Background' },
]

const VALUES = { format: 'webp', quality: 80, strip: true, background: '#ff0000' }

function renderPanel(overrides: Partial<Record<string, unknown>> = {}) {
  const onChange = vi.fn()
  render(
    <SettingsPanel
      schema={SCHEMA}
      values={{ ...VALUES, ...overrides }}
      onChange={onChange}
    />,
  )
  return { onChange }
}

describe('SettingsPanel', () => {
  it('renders one labelled control per field, of the kind the schema asked for', () => {
    renderPanel()
    expect(screen.getByLabelText('Format').tagName).toBe('SELECT')
    expect(screen.getByLabelText('Quality')).toHaveAttribute('type', 'range')
    expect(screen.getByLabelText('Strip metadata')).toHaveAttribute('type', 'checkbox')
    expect(screen.getByLabelText('Background')).toHaveAttribute('type', 'color')
  })

  it('shows each field at its current value', () => {
    renderPanel()
    expect(screen.getByLabelText('Format')).toHaveValue('webp')
    expect(screen.getByLabelText('Quality')).toHaveValue('80')
    expect(screen.getByLabelText('Strip metadata')).toBeChecked()
    expect(screen.getByLabelText('Background')).toHaveValue('#ff0000')
  })

  it('reports a select change as the whole next values object, leaving the rest alone', () => {
    const { onChange } = renderPanel()
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'png' } })
    expect(onChange).toHaveBeenCalledWith({ ...VALUES, format: 'png' })
  })

  it('reports a slider as a number, not the input’s string', () => {
    const { onChange } = renderPanel()
    fireEvent.change(screen.getByLabelText('Quality'), { target: { value: '55' } })
    expect(onChange).toHaveBeenCalledWith({ ...VALUES, quality: 55 })
  })

  it('reports a toggle as a boolean', () => {
    const { onChange } = renderPanel()
    fireEvent.click(screen.getByLabelText('Strip metadata'))
    expect(onChange).toHaveBeenCalledWith({ ...VALUES, strip: false })
  })

  it('shows a slider’s number, since "quality 80" is a value people compare across tools', () => {
    renderPanel()
    expect(screen.getByText('80')).toBeInTheDocument()
  })

  it('falls back to the minimum for a slider with no value yet, rather than rendering NaN', () => {
    renderPanel({ quality: undefined })
    expect(screen.getByLabelText('Quality')).toHaveValue('1')
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders nothing at all for an empty schema, so a module with no knobs shows no panel', () => {
    const { container } = render(
      <SettingsPanel schema={[]} values={{}} onChange={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
