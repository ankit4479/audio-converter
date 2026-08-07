/**
 * One set of converter settings per module, for the whole session (E1.5, issue
 * #29) - the settings counterpart of intake/sharedIntakeStore.ts, and for the
 * same reason.
 *
 * Changing the output format is a navigation, so react-router unmounts and
 * remounts the widget (see ConverterShell's key comment). Settings held in the
 * widget's own useState therefore died with it: someone who set the sample rate
 * to 48 kHz and turned song info off on /wav-to-mp3, then picked FLAC, landed on
 * /wav-to-flac with both silently back at the module's defaults - and the batch
 * would have run with those defaults, not what they had just chosen. Their files
 * survive the same navigation (sharedIntakeStore), so their settings have to as
 * well.
 *
 * Keyed by module id because settings are a module's own shape (audio's codec/
 * quality/sample rate mean nothing to an image module). The codec is stored along
 * with the rest, but a conversion page always overrides it with the target its
 * URL names, so a remembered codec can never contradict the address bar - it only
 * decides what a hub page (which names no target) opens on.
 *
 * Module-level rather than a React context for the same reason as the intake
 * store: it has to outlive the subtree a provider would live in, since the
 * remount is the whole problem. Session-only and deliberately not persisted -
 * nothing here is written to storage anywhere else in the app either.
 */
const SETTINGS_BY_MODULE = new Map<string, unknown>()

/** The module's remembered settings, or `defaults` if it has none yet. Typed
 *  through the caller, which is the only place that knows a module's real
 *  settings shape (the registry erases it to `unknown` - see registry.ts). */
export function sharedSettings<TSettings>(
  moduleId: string,
  defaults: TSettings,
): TSettings {
  const stored = SETTINGS_BY_MODULE.get(moduleId)
  return stored === undefined ? defaults : (stored as TSettings)
}

/** Records the settings a widget is now using, so the next mount of any of that
 *  module's pages starts from them. */
export function rememberSettings(moduleId: string, settings: unknown): void {
  SETTINGS_BY_MODULE.set(moduleId, settings)
}

/** Test-only: drops every remembered setting so test files don't leak them into
 *  each other through this singleton, mirroring registry._resetForTests and
 *  sharedIntakeStore._resetForTests. */
export function _resetForTests(): void {
  SETTINGS_BY_MODULE.clear()
}
