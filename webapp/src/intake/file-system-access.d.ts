/**
 * TypeScript's bundled DOM lib doesn't model the File System Access API's picker
 * entry points at all (confirmed: no occurrence of `showDirectoryPicker` anywhere
 * under node_modules/typescript/lib) even though it does model the handle types
 * (FileSystemDirectoryHandle etc.) those pickers return. This fills the one gap
 * actually used - runtime support (Chrome/Edge only) is feature-detected in
 * scanDirectoryPicker.ts, not assumed from this type existing.
 */
interface Window {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    /** Opens the native picker already scoped to this folder - the closest browsers
     *  get to letting a user visually confirm where a batch landed (issue #15's
     *  "Show in Finder" replacement, since no API can literally open Finder). */
    startIn?: FileSystemDirectoryHandle
  }) => Promise<FileSystemDirectoryHandle>
}
