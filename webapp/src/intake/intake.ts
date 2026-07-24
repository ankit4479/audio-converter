import type { ConverterModule } from '../platform/module'
import { toAudioFile, type AudioFile, type ScannedFile } from './audioFile'

/** Applies the module's accept filter and builds AudioFiles from any scan source
 *  (drop, directory handle, or either FileList variant) - the one step every
 *  intake path funnels through before files ever reach app state. Takes the
 *  module rather than importing isAudioFileName directly (E0.4, issue #24), so
 *  the filter always matches whatever module the shell is actually driving. */
export function filterAndBuildAudioFiles(
  scanned: readonly ScannedFile[],
  module: Pick<ConverterModule, 'accepts'>,
): AudioFile[] {
  return scanned.filter((s) => module.accepts(s.file)).map(toAudioFile)
}
