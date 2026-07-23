import { useState } from 'react'
import type { CodecId, CompressionTier, QualityTier, SampleRate } from './engine/codec'
import { useFileIntake } from './intake/useFileIntake'
import { ConvertView } from './screens/ConvertView'
import { SetupView, type SetupSettings } from './screens/SetupView'
import { useConversion } from './screens/useConversion'

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
  const conversion = useConversion()

  // AppState.chooseDestinationAndConvert: prompts for a destination, then starts
  // the batch. Stays on setup if the user cancels the destination picker.
  const handleConvert = () => {
    void (async () => {
      const started = await conversion.controller.start(files, settings)
      if (started) setScreen('convert')
    })()
  }

  // AppState.cancelAndReturnToSetup: stop in-flight work, keep the file list.
  const handleChange = () => {
    conversion.controller.cancel()
    setScreen('setup')
  }

  // AppState.convertMore: drop this run's state and the file list, back to a
  // fresh setup screen.
  const handleConvertMore = () => {
    conversion.controller.reset()
    store.clear()
    setScreen('setup')
  }

  if (screen === 'convert' && conversion.scheduler && conversion.destination) {
    return (
      <ConvertView
        scheduler={conversion.scheduler}
        destination={conversion.destination}
        codecLabel={conversion.codecLabel}
        finalized={conversion.finalized}
        onChange={handleChange}
        onConvertMore={handleConvertMore}
      />
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
      onConvert={handleConvert}
    />
  )
}

export default App
