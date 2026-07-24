/**
 * Module registry (E0.2, issue #22): where ConverterModules are registered and
 * looked up by id or category. Deliberately holds no audio-specific knowledge and
 * registers nothing itself - the audio module registers here once it exists
 * (#23). See docs/platform-expansion-plan.md section 3.
 */
import type { CategoryId, ConverterModule } from './module'

// Modules are stored with their settings type erased to `unknown` - the registry
// itself never reads or produces a settings value, it only ever hands a module
// back to a caller who already knows (or doesn't care) what that module's real
// settings type is. `unknown` is what "opaque, don't know yet" actually means
// here; `never` would typecheck too (nested bivariant method checks let it slip
// through) but reads backwards - it's the type with no values at all, not "value
// of an unknown type", so it would mislead the next reader.
const MODULES = new Map<string, ConverterModule<unknown>>()

/** Registers a module under its own id. Throws on a duplicate id - a second
 *  module silently shadowing the first would be a build-time mistake, not a
 *  runtime case to handle gracefully. No cast needed: ConverterModule<TSettings>
 *  is assignable to ConverterModule<unknown> for any TSettings, since TSettings
 *  only ever appears where "assignable to unknown" is all that's required. */
export function register<TSettings>(module: ConverterModule<TSettings>): void {
  if (MODULES.has(module.id)) {
    throw new Error(`A module with id "${module.id}" is already registered.`)
  }
  MODULES.set(module.id, module)
}

export function get(id: string): ConverterModule<unknown> | undefined {
  return MODULES.get(id)
}

export function all(): readonly ConverterModule<unknown>[] {
  return [...MODULES.values()]
}

export function byCategory(category: CategoryId): readonly ConverterModule<unknown>[] {
  return all().filter((module) => module.category === category)
}

/** Test-only: clears every registration so test files don't leak state into each
 *  other through this module-level singleton. */
export function _resetForTests(): void {
  MODULES.clear()
}
