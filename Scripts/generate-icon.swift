import AppKit

// Draws the app icon: a rounded-square canvas in the mockup's pink-to-red gradient
// with a centered white waveform, the same motif used in the drop zone. Run with
// `swift Scripts/generate-icon.swift <output.png>`.

let size = 1024
let outputPath = CommandLine.arguments[1]
let rect = CGRect(x: 0, y: 0, width: size, height: size)
let colorSpace = CGColorSpaceCreateDeviceRGB()

guard let context = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
    space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else { fatalError("could not create context") }

let cornerRadius = CGFloat(size) * 0.223
let clipPath = CGPath(roundedRect: rect, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)
context.addPath(clipPath)
context.clip()

let colors = [
    NSColor(calibratedRed: 0xFF / 255, green: 0x5C / 255, blue: 0x82 / 255, alpha: 1).cgColor,
    NSColor(calibratedRed: 0xE3 / 255, green: 0x1C / 255, blue: 0x4D / 255, alpha: 1).cgColor
] as CFArray
guard let gradient = CGGradient(colorsSpace: colorSpace, colors: colors, locations: [0, 1]) else {
    fatalError("could not create gradient")
}
context.drawLinearGradient(
    gradient,
    start: CGPoint(x: 0, y: size),
    end: CGPoint(x: size, y: 0),
    options: []
)

let heights: [CGFloat] = [0.28, 0.48, 0.70, 0.95, 0.70, 0.48, 0.28].map { $0 * CGFloat(size) * 0.5 }
let barWidth = CGFloat(size) * 0.052
let spacing = CGFloat(size) * 0.04
let totalWidth = CGFloat(heights.count) * barWidth + CGFloat(heights.count - 1) * spacing
var x = (CGFloat(size) - totalWidth) / 2
let midY = CGFloat(size) / 2

context.setFillColor(NSColor.white.cgColor)
for h in heights {
    let barRect = CGRect(x: x, y: midY - h / 2, width: barWidth, height: h)
    let barPath = CGPath(roundedRect: barRect, cornerWidth: barWidth / 2, cornerHeight: barWidth / 2, transform: nil)
    context.addPath(barPath)
    context.fillPath()
    x += barWidth + spacing
}

guard let cgImage = context.makeImage() else { fatalError("could not render image") }
let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
    fatalError("could not encode png")
}
try pngData.write(to: URL(fileURLWithPath: outputPath))
print("wrote \(outputPath)")
