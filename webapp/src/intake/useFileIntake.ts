import { useEffect, useSyncExternalStore } from 'react'
import type { ConverterModule } from '../platform/module'
import { sharedIntakeStore } from './sharedIntakeStore'

/**
 * Thin React adapter for FileIntakeStore, the only place in the intake module that
 * imports React - the store itself stays framework-agnostic.
 *
 * Takes the module the shell is currently driving rather than resolving 'audio'
 * from the registry itself (as it did through #24): since E1.5 (issue #29) the
 * page decides which module that is, and a target change can swap it. The store
 * comes from sharedIntakeStore, not a useMemo, so the file list survives the
 * remount every conversion-route navigation causes; the effect below is what
 * carries those files into the new module (dropping the ones it can't accept).
 */
export function useFileIntake(module: Pick<ConverterModule, 'accepts'>) {
  const store = sharedIntakeStore(module)
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)

  useEffect(() => {
    store.setModule(module)
  }, [store, module])

  return { store, ...snapshot }
}
