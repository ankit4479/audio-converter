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
  }) => Promise<FileSystemDirectoryHandle>
}
