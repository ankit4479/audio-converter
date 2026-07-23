import { isAudioFileName } from './audioFileTypes'
import { toAudioFile, type AudioFile, type ScannedFile } from './audioFile'

/** Applies the extension filter and builds AudioFiles from any scan source (drop,
 *  directory handle, or either FileList variant) - the one step every intake path
 *  funnels through before files ever reach app state. */
export function filterAndBuildAudioFiles(scanned: readonly ScannedFile[]): AudioFile[] {
  return scanned.filter((s) => isAudioFileName(s.file.name)).map(toAudioFile)
}
