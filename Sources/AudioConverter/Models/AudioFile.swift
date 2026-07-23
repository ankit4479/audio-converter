import Foundation

struct AudioFile: Identifiable, Hashable {
    let id = UUID()
    let url: URL
    /// Path relative to the drop root, used to mirror source folder structure in the
    /// destination. A loose dropped file is just its filename; a file found inside a
    /// dropped folder is prefixed with that folder's name, the same way Finder would
    /// carry the folder along if you copied it.
    let relativePath: String
    let fileSize: Int64

    var displayName: String { url.lastPathComponent }
}

enum AudioFileTypes {
    /// Extensions we accept when scanning drops. This is a filter to keep obviously
    /// non-audio files out of the list, not an exhaustive validator, ffmpeg itself is
    /// the source of truth and any file that fails to decode is reported as a per-file
    /// failure rather than blocking the batch.
    static let extensions: Set<String> = [
        "mp3", "m4a", "aac", "flac", "wav", "aiff", "aif",
        "opus", "ogg", "oga", "wma", "wv", "ape", "caf", "alac"
    ]

    static func isAudioFile(_ url: URL) -> Bool {
        extensions.contains(url.pathExtension.lowercased())
    }
}
