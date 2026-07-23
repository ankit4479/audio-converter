import type { ScannedFile } from './audioFile'

/** A plain `<input type="file" multiple>` (no webkitdirectory) or a drop of loose
 *  files with no webkitGetAsEntry support: every file is loose, relativePath is
 *  just its name, matching FileIntake.scan's non-directory branch. */
export function scanFileList(fileList: FileList): ScannedFile[] {
  return Array.from(fileList).map((file) => ({ file, relativePath: file.name }))
}

/** `<input type="file" webkitdirectory multiple>`: the browser already computes
 *  `webkitRelativePath` as "folderName/sub/path/file.ext" for every file, so there's
 *  no manual tree-walking needed here at all, unlike the drop and directory-handle
 *  paths. */
export function scanWebkitDirectoryFileList(fileList: FileList): ScannedFile[] {
  return Array.from(fileList).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }))
}
