/**
 * Picks how the active module's settings are rendered (E2.1, issue #31).
 *
 * Most modules declare their settings as data and get the schema-driven
 * SettingsPanel, plus the shared "Convert to" FormatSelect for the one field the URL
 * owns. Audio is the exception: its copy is conditional on the codec's *kind*
 * (lossy/lossless/uncompressed prose, whether a compression level exists at all),
 * which SettingField cannot express, so it keeps hand-written controls.
 *
 * That exception is a map in this file rather than a field on the module because
 * platform/module.ts has to stay free of React - a module's engine is loaded inside a
 * Worker. The map is expected to shrink: once the schema can carry conditional copy,
 * audio joins the generic path and BESPOKE_PANELS goes away.
 */
import type { ComponentType } from 'react'
import { AudioSettings } from '../screens/AudioSettings'
import type { SetupSettings } from '../screens/SetupView'
import { targetsForSource } from './converterTargets'
import { FormatSelect } from './FormatSelect'
import { formatNode } from './graph'
import type { ConverterModule, FormatId } from './module'
import { SettingsPanel } from './SettingsPanel'

export interface ModuleSettingsProps {
  module: ConverterModule<unknown>
  /** Opaque here: only the module's own panel (or the schema) knows the shape. */
  settings: unknown
  onSettingsChange: (settings: unknown) => void
  /** A finished output-format pick. See FormatSelect for why a committed pick is
   *  distinct from the visible value changing. */
  onTargetCommit: (format: FormatId) => void
  /** The format this page converts from, when it is about one specific conversion. */
  source?: FormatId
  /** How many files are in the current batch - see SettingVisibilityContext. */
  fileCount?: number
}

const BESPOKE_PANELS: Record<string, ComponentType<ModuleSettingsProps>> = {
  audio: ({ settings, onSettingsChange, onTargetCommit, source }) => (
    <AudioSettings
      settings={settings as SetupSettings}
      onSettingsChange={onSettingsChange}
      onTargetCommit={onTargetCommit}
      source={source}
    />
  ),
}

export function ModuleSettings(props: ModuleSettingsProps) {
  const Bespoke = BESPOKE_PANELS[props.module.id]
  if (Bespoke) return <Bespoke {...props} />
  return <SchemaSettings {...props} />
}

function SchemaSettings({
  module,
  settings,
  onSettingsChange,
  onTargetCommit,
  source,
  fileCount,
}: ModuleSettingsProps) {
  const values = settings as Record<string, unknown>
  const targetKey = module.targetSettingKey

  // With a source format the graph is the authority on what this page can convert
  // into (and it never contains an X-to-X edge). Without one - a hub page - the
  // module's own outputFormats is the honest list.
  const options = (
    source === undefined
      ? module.outputFormats.map((to) => ({ to }))
      : targetsForSource(source)
  ).map(({ to }) => ({ value: to, label: formatNode(to)?.label ?? to }))

  return (
    <>
      <FormatSelect
        label="Convert to"
        value={String(values[targetKey] ?? '')}
        groups={[{ options }]}
        onValueChange={(value) => onSettingsChange({ ...values, [targetKey]: value })}
        onCommit={onTargetCommit}
      />
      <SettingsPanel
        // The target format is already the FormatSelect above, and it is the field
        // the URL owns - rendering it again as an ordinary select would give the
        // page two controls for one value, only one of which navigates.
        schema={module.settingsSchema.filter((field) => field.key !== targetKey)}
        values={values}
        source={source}
        fileCount={fileCount}
        onChange={onSettingsChange}
      />
    </>
  )
}
