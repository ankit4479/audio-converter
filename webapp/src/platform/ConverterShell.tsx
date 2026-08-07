/**
 * The shared converter shell (E1.5, issue #29; docs/platform-expansion-plan.md
 * section 5.5). Every hub and per-conversion page renders this, parameterized by
 * the module it drives - it replaces App.tsx, which hardcoded the audio module
 * and could only ever be wrapped in the home page's marketing frame.
 *
 * Two things are deliberately split here:
 *
 * 1. The frame (header, h1, footer) renders on the server/prerender pass, while
 *    only the widget sits inside ClientOnlyWidget. The h1 is the one piece of
 *    per-page content a crawler must see, so it cannot live inside the
 *    browser-only half. The fuller SEO body (intro, FAQ schema, related strip) is
 *    #30's scope.
 * 2. Changing the target format is a navigation, never a content swap: each edge
 *    has its own prerendered page, and that only pays off if selecting a
 *    conversion actually lands on it (see the design comment on #29). So the
 *    "Convert to" control hands its choice to this shell, which turns it into a
 *    route change when the current page has a source format to pair it with.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useFileIntake } from '../intake/useFileIntake'
import { ConvertView } from '../screens/ConvertView'
import { SetupView } from '../screens/SetupView'
import { useConversion } from '../screens/useConversion'
import { ClientOnlyWidget } from './ClientOnlyWidget'
import { targetForEdge } from './converterTargets'
import { formatNode, outputExtension } from './graph'
import { ModuleSettings } from './ModuleSettings'
import type { FormatId } from './module'
import { requireModule } from './registry'
import { rememberSettings, sharedSettings } from './sharedSettings'
import { SiteFooter, SiteHeader } from './SiteChrome'

export interface ConverterShellProps {
  /** Which registered module drives this page. */
  moduleId: string
  /** The page's h1, e.g. "WAV to MP3 Converter". Passed in by the route, which is
   *  the only thing that knows whether it is a hub or a single conversion. */
  heading: string
  /** The source format this page is about, when it is about one specific
   *  conversion. Undefined on a hub page, which is about a whole category - with
   *  no source there is no edge, so no target change can become a navigation. */
  source?: FormatId
  /** The output format the page's URL already promises. */
  target?: FormatId
  /** Rendered between the h1 and the tool, inside the prerendered frame - the hub
   *  pages put their ConverterSelect here, so its target links are in the static
   *  HTML a crawler sees rather than appearing only after hydration. */
  intro?: ReactNode
}

export function ConverterShell({
  moduleId,
  heading,
  source,
  target,
  intro,
}: ConverterShellProps) {
  return (
    <div className="min-h-screen bg-surface-page">
      <SiteHeader />
      <main>
        {/* 680px, not the header's 760px: this block is left-aligned above the
            tool, and SetupView's own column is 680px - matching it lines their
            left edges up instead of leaving the h1 hanging 40px further out. */}
        <div className="mx-auto max-w-[680px] space-y-4 px-6 pt-8">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {heading}
          </h1>
          {intro}
        </div>
        <ClientOnlyWidget>
          {() => (
            // Keyed on what the page is, so arriving at another conversion is a
            // fresh widget. Every conversion route renders this same component
            // (routes.ts generates one path per edge, all pointing at
            // routes/conversion.tsx), so React would otherwise reconcile rather
            // than remount and the widget would keep the previous page's settings
            // - the URL would say wav-to-aac while the picker still said MP3. The
            // file list survives regardless: it lives in sharedIntakeStore, above
            // the component tree.
            <ConverterWidget
              key={`${moduleId}:${source ?? ''}:${target ?? ''}`}
              moduleId={moduleId}
              source={source}
              target={target}
            />
          )}
        </ClientOnlyWidget>
      </main>
      <SiteFooter />
    </div>
  )
}

function ConverterWidget({
  moduleId,
  source,
  target,
}: Pick<ConverterShellProps, 'moduleId' | 'source' | 'target'>) {
  const module = requireModule(moduleId)
  const { store, files, totalDuration, isCalculatingDuration, droppedOnModuleChange } =
    useFileIntake(module)
  // Opaque to the shell (E2.1, issue #31): only the module's own panel, or the
  // schema-driven one, knows what shape these settings have. The one field the shell
  // does touch is named by the module - targetSettingKey - because that is the field
  // the URL owns.
  //
  // Seeded from sharedSettings, not straight from the defaults: a target change is a
  // navigation that remounts this widget, so anything the user had tuned (sample
  // rate, quality, song info) would otherwise be silently back at the defaults on
  // the page they land on - and the batch would run with those. The URL's own target
  // still wins over the remembered one, so the picker can never disagree with the
  // address bar.
  const [settings, setSettings] = useState<Record<string, unknown>>(() => ({
    ...(sharedSettings(moduleId, module.defaultSettings) as Record<string, unknown>),
    ...(target === undefined ? {} : { [module.targetSettingKey]: target }),
  }))
  const targetFormat = String(settings[module.targetSettingKey] ?? '')
  const [screen, setScreen] = useState<'setup' | 'convert'>('setup')
  const conversion = useConversion()
  const navigate = useNavigate()

  // Leaving the page mid-batch - a target change, a mega-menu link, the back
  // button - must not leave workers converting and writing output behind the
  // user's back. cancel() aborts the in-flight jobs, which lets
  // BatchScheduler.run's `finally` dispose each worker slot's engine; that is the
  // "old engine disposed, no worker leak on swap" half of this issue, and it
  // covers every way out of the page rather than only the format picker.
  const { controller } = conversion
  useEffect(() => () => controller.cancel(), [controller])

  // Every settings change is remembered for this module as well as rendered, so it
  // survives the remount a target change causes (see sharedSettings.ts).
  const handleSettingsChange = (next: unknown) => {
    rememberSettings(moduleId, next)
    setSettings(next as Record<string, unknown>)
  }

  // AppState.chooseDestinationAndConvert: prompts for a destination, then starts
  // the batch. Stays on setup if the user cancels the destination picker.
  const handleConvert = () => {
    void (async () => {
      const started = await controller.start(files, settings, {
        moduleId,
        // Both come from the graph rather than from any module's own table, so one
        // lookup serves every module. A format with no node would be a graph/module
        // disagreement, so fall back to the id itself rather than writing files with
        // no extension at all.
        extension: outputExtension(targetFormat) ?? targetFormat,
        label: formatNode(targetFormat)?.label ?? targetFormat,
      })
      if (started) setScreen('convert')
    })()
  }

  // AppState.cancelAndReturnToSetup: stop in-flight work, keep the file list.
  const handleChange = () => {
    controller.cancel()
    setScreen('setup')
  }

  // AppState.convertMore: drop this run's state and the file list, back to a
  // fresh setup screen.
  const handleConvertMore = () => {
    controller.reset()
    store.clear()
    setScreen('setup')
  }

  /**
   * A finished "Convert to" pick. With a source format in the URL this is a real
   * conversion with a page of its own, so it becomes a navigation and the new
   * route re-enters this shell with the new target (and, if the target belongs to
   * another module, the other module) - the URL never disagrees with what the app
   * is about to produce.
   *
   * Without one (a hub page, which is about a category rather than an edge) there
   * is no such page to go to, so the pick stays the settings change SetupView
   * already made through onSettingsChange.
   *
   * Doing nothing when the pick matches the page's own target is what keeps this
   * safe to call more than once for one choice - SetupView commits on a pointer
   * selection and again on blur - since navigate() to the current path would
   * otherwise push a duplicate history entry and cost the back button a press.
   */
  const handleTargetCommit = (format: FormatId) => {
    if (format === target) return
    const edge = source === undefined ? undefined : targetForEdge(source, format)
    if (!edge) return
    void navigate(edge.href)
  }

  return screen === 'convert' && conversion.scheduler && conversion.destination ? (
    <ConvertView
      scheduler={conversion.scheduler}
      destination={conversion.destination}
      targetLabel={conversion.targetLabel}
      finalized={conversion.finalized}
      onChange={handleChange}
      onConvertMore={handleConvertMore}
    />
  ) : (
    <>
      <DroppedFilesNotice
        count={droppedOnModuleChange.length}
        moduleLabel={module.label}
        onDismiss={() => store.acknowledgeDroppedFiles()}
      />
      <SetupView
        store={store}
        files={files}
        totalDuration={totalDuration}
        isCalculatingDuration={isCalculatingDuration}
        presentation={module.presentation}
        category={module.category}
        settings={
          <ModuleSettings
            module={module}
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onTargetCommit={handleTargetCommit}
            source={source}
          />
        }
        onConvert={handleConvert}
      />
    </>
  )
}

/**
 * Files carried into a converter that can't accept them are removed, and this is
 * what says so - the acceptance criterion is that they never just quietly
 * disappear from the list.
 *
 * The role="status" region stays mounted even at count 0 (rendering nothing
 * visible) because a live region only announces changes to a region the assistive
 * technology was already observing: mounting the region and its text in the same
 * update is the classic reason a screen reader stays silent. So the region is
 * always there and only its contents come and go.
 *
 * Sized and inset to match SetupView's own column exactly (max-w-[680px] with 24px
 * of horizontal padding), so the notice lines up with the tool it sits above
 * instead of overhanging it - and so it doesn't run edge-to-edge on a phone, where
 * SetupView's content is still inset.
 */
function DroppedFilesNotice({
  count,
  moduleLabel,
  onDismiss,
}: {
  count: number
  moduleLabel: string
  onDismiss: () => void
}) {
  return (
    // The outer element carries SetupView's column geometry (mx-auto,
    // max-w-[680px], px-6) and, only when there is something to show, pt-6 for the
    // gap the h1 block above doesn't provide; the inner element is the card itself,
    // so its edges land on SetupView's card edges rather than 24px outside them.
    <div
      role="status"
      className={`mx-auto max-w-[680px] px-6 ${count > 0 ? 'pt-6' : ''}`}
    >
      {count > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-chip border border-border bg-surface px-4 py-3 text-callout text-text-secondary">
          <p>
            {count} file{count === 1 ? '' : 's'} {count === 1 ? 'was' : 'were'} removed:
            the {moduleLabel.toLowerCase()} converter can&apos;t read{' '}
            {count === 1 ? 'it' : 'them'}.
          </p>
          <button
            type="button"
            className="shrink-0 text-caption text-text-secondary underline"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
