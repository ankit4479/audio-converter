import { useMemo, useSyncExternalStore } from 'react'
import { FileIntakeStore } from './FileIntakeStore'

/** Thin React adapter for FileIntakeStore, the only place in the intake module that
 *  imports React - the store itself stays framework-agnostic. */
export function useFileIntake() {
  const store = useMemo(() => new FileIntakeStore(), [])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return { store, ...snapshot }
}
