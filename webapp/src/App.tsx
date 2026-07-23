import { useState } from 'react'
import type { CodecId, CompressionTier, QualityTier, SampleRate } from './engine/codec'
import { useFileIntake } from './intake/useFileIntake'
import { SetupView, type SetupSettings } from './screens/SetupView'

// Defaults match AppState.swift:16-20 exactly.
const DEFAULT_SETTINGS: SetupSettings = {
  codec: 'flac' as CodecId,
  quality: 'best' as QualityTier,
  compression: 'balanced' as CompressionTier,
  sampleRate: 'keepOriginal' as SampleRate,
  keepMetadata: true,
}

function App() {
  const { store, files, totalDuration, isCalculatingDuration } = useFileIntake()
  const [settings, setSettings] = useState<SetupSettings>(DEFAULT_SETTINGS)
  const [screen, setScreen] = useState<'setup' | 'convert'>('setup')

  if (screen === 'convert') {
    // The real Convert screen lands in issue #15, built on top of the output
    // handling (#10) and batch scheduler (#11) landing right after this one.
    return (
      <main className="mx-auto max-w-[680px] p-6">
        <p className="text-callout text-text-secondary">
          Converting {files.length} song{files.length === 1 ? '' : 's'} to{' '}
          {settings.codec}… (Convert screen: issue #15)
        </p>
      </main>
    )
  }

  return (
    <SetupView
      store={store}
      files={files}
      totalDuration={totalDuration}
      isCalculatingDuration={isCalculatingDuration}
      settings={settings}
      onSettingsChange={setSettings}
      onConvert={() => setScreen('convert')}
    />
  )
}

export default App
