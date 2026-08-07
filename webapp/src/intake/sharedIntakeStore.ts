/**
 * One FileIntakeStore for the whole session (E1.5, issue #29).
 *
 * routes.ts generates a separate route - and therefore a separate route id - per
 * graph edge, so changing the target format navigates from /wav-to-mp3 to
 * /wav-to-aac and react-router unmounts and remounts the widget. A store created
 * per mount (which is what useFileIntake used to do with useMemo) would take the
 * dropped files down with it, so every format change would mean dropping the
 * files again. Hoisting the instance out of the component tree is what lets the
 * file list survive that navigation, which is exactly issue #29's "carry selected
 * files forward" requirement.
 *
 * Module-level rather than a React context because it has to outlive the subtree
 * a context provider would live in - the remount is the whole problem.
 */
import { FileIntakeStore } from './FileIntakeStore'
import type { ConverterModule } from '../platform/module'

let shared: FileIntakeStore | null = null

/**
 * The session's store, created for the given module if it doesn't exist yet.
 *
 * Only ever creates - retargeting an existing store to a different module is
 * FileIntakeStore.setModule's job, called from an effect in useFileIntake.
 * Retargeting here instead would mean mutating a store other components are
 * subscribed to while React is rendering.
 */
export function sharedIntakeStore(
  module: Pick<ConverterModule, 'accepts'>,
): FileIntakeStore {
  shared ??= new FileIntakeStore(module)
  return shared
}

/** Test-only: drops the instance so test files don't leak files (or a module)
 *  into each other through this singleton, mirroring registry._resetForTests. */
export function _resetForTests(): void {
  shared = null
}
