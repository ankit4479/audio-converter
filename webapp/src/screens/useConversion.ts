import { useMemo, useSyncExternalStore } from 'react'
import { ConversionController } from './ConversionController'

/** Thin React adapter for ConversionController, the only place in this module that
 *  imports React - mirrors intake/useFileIntake.ts's pattern. */
export function useConversion() {
  const controller = useMemo(() => new ConversionController(), [])
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return { controller, ...snapshot }
}
