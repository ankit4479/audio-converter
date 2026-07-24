import { useState } from 'react'
import './modules/register'
import { requireModule } from './platform/registry'
import { useFileIntake } from './intake/useFileIntake'
import { ConvertView } from './screens/ConvertView'
import { LandingPage } from './screens/LandingPage'
import { SetupView, type SetupSettings } from './screens/SetupView'
import { useConversion } from './screens/useConversion'

// E0.4 (issue #24): the shell resolves its one active module (audio) from the
// registry instead of importing engine code or its own copy of the defaults -
// AppState.swift:16-20's values now live in exactly one place, modules/audio/
// index.ts's DEFAULT_SETTINGS.
const audioModule = requireModule('audio')

function App() {
  const { store, files, totalDuration, isCalculatingDuration } = useFileIntake()
  const [settings, setSettings] = useState<SetupSettings>(
    audioModule.defaultSettings as SetupSettings,
  )
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

  return (
    <LandingPage screen={screen}>
      {screen === 'convert' && conversion.scheduler && conversion.destination ? (
        <ConvertView
          scheduler={conversion.scheduler}
          destination={conversion.destination}
          codecLabel={conversion.codecLabel}
          finalized={conversion.finalized}
          onChange={handleChange}
          onConvertMore={handleConvertMore}
        />
      ) : (
        <SetupView
          store={store}
          files={files}
          totalDuration={totalDuration}
          isCalculatingDuration={isCalculatingDuration}
          settings={settings}
          onSettingsChange={setSettings}
          onConvert={handleConvert}
        />
      )}
    </LandingPage>
  )
}

export default App
