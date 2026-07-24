import { useMemo, useSyncExternalStore } from 'react'
import { requireModule } from '../platform/registry'
import { FileIntakeStore } from './FileIntakeStore'

/** Thin React adapter for FileIntakeStore, the only place in the intake module that
 *  imports React - the store itself stays framework-agnostic. Resolves the audio
 *  module from the platform registry (E0.4, issue #24) rather than the store
 *  hardcoding an audio-only file filter itself; App.tsx's `import
 *  './modules/register'` guarantees the module is registered before this runs. */
export function useFileIntake() {
  const store = useMemo(() => new FileIntakeStore(requireModule('audio')), [])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return { store, ...snapshot }
}
