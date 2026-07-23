import SwiftUI
import AppKit

/// The app's pink accent, tuned separately per appearance so it reads as lively on
/// white without turning into a neon glow on black. Mirrors the two-token pattern from
/// the interface prototype: a more saturated pink for light mode, a softer one for dark.
enum Theme {
    static let accent = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            ? NSColor(calibratedRed: 0xFF / 255, green: 0x5C / 255, blue: 0x82 / 255, alpha: 1)
            : NSColor(calibratedRed: 0xFA / 255, green: 0x23 / 255, blue: 0x59 / 255, alpha: 1)
    })

    static let accentHover = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            ? NSColor(calibratedRed: 0xFF / 255, green: 0x7F / 255, blue: 0xA0 / 255, alpha: 1)
            : NSColor(calibratedRed: 0xFF / 255, green: 0x44 / 255, blue: 0x70 / 255, alpha: 1)
    })

    static let accentInk = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            ? NSColor(calibratedRed: 0x2A / 255, green: 0x0A / 255, blue: 0x14 / 255, alpha: 1)
            : .white
    })

    static let success = Color(nsColor: .systemGreen)
}
