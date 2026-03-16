import AppKit
import Foundation

let arguments = CommandLine.arguments

guard arguments.count == 2 else {
    fputs("Usage: swift generate_app_icon.swift /path/to/output.png\n", stderr)
    exit(1)
}

let outputURL = URL(fileURLWithPath: arguments[1])
let canvasSize = CGSize(width: 1024, height: 1024)
let image = NSImage(size: canvasSize)

image.lockFocus()
guard let context = NSGraphicsContext.current?.cgContext else {
    fputs("Failed to acquire drawing context.\n", stderr)
    exit(1)
}

context.setAllowsAntialiasing(true)
context.interpolationQuality = .high

let fullRect = CGRect(origin: .zero, size: canvasSize)
let backgroundPath = NSBezierPath(roundedRect: fullRect, xRadius: 228, yRadius: 228)
backgroundPath.addClip()

let gradient = NSGradient(
    colors: [
        NSColor(srgbRed: 0.06, green: 0.32, blue: 0.42, alpha: 1.0),
        NSColor(srgbRed: 0.09, green: 0.60, blue: 0.56, alpha: 1.0),
        NSColor(srgbRed: 0.31, green: 0.74, blue: 0.56, alpha: 1.0)
    ],
    atLocations: [0.0, 0.58, 1.0],
    colorSpace: .sRGB
)
gradient?.draw(in: backgroundPath, angle: 52)

context.saveGState()
context.setBlendMode(.screen)
NSColor.white.withAlphaComponent(0.14).setFill()
context.fillEllipse(in: CGRect(x: 632, y: 692, width: 272, height: 196))
context.fillEllipse(in: CGRect(x: 130, y: 122, width: 340, height: 248))
context.restoreGState()

let cardRect = CGRect(x: 174, y: 148, width: 676, height: 736)
let cardPath = NSBezierPath(roundedRect: cardRect, xRadius: 136, yRadius: 136)

context.saveGState()
context.setShadow(
    offset: CGSize(width: 0, height: -28),
    blur: 60,
    color: NSColor.black.withAlphaComponent(0.18).cgColor
)
NSColor(srgbRed: 0.98, green: 0.98, blue: 0.95, alpha: 1.0).setFill()
cardPath.fill()
context.restoreGState()

let accentRect = CGRect(x: cardRect.minX + 72, y: cardRect.maxY - 150, width: 182, height: 42)
let accentPath = NSBezierPath(roundedRect: accentRect, xRadius: 21, yRadius: 21)
NSColor(srgbRed: 0.98, green: 0.74, blue: 0.34, alpha: 1.0).setFill()
accentPath.fill()

let accentDot = NSBezierPath(ovalIn: CGRect(x: cardRect.maxX - 146, y: cardRect.maxY - 140, width: 52, height: 52))
NSColor(srgbRed: 0.95, green: 0.38, blue: 0.33, alpha: 1.0).setFill()
accentDot.fill()

func drawCheckRow(y: CGFloat, lineWidth: CGFloat, tint: NSColor) {
    let circleRect = CGRect(x: cardRect.minX + 76, y: y - 19, width: 56, height: 56)
    let circlePath = NSBezierPath(ovalIn: circleRect)
    tint.setFill()
    circlePath.fill()

    let checkPath = NSBezierPath()
    checkPath.move(to: CGPoint(x: circleRect.minX + 16, y: circleRect.midY - 2))
    checkPath.line(to: CGPoint(x: circleRect.minX + 25, y: circleRect.midY - 13))
    checkPath.line(to: CGPoint(x: circleRect.minX + 41, y: circleRect.midY + 12))
    checkPath.lineCapStyle = .round
    checkPath.lineJoinStyle = .round
    checkPath.lineWidth = 8
    NSColor.white.setStroke()
    checkPath.stroke()

    let mainLineRect = CGRect(x: circleRect.maxX + 28, y: y + 7, width: lineWidth, height: 22)
    let mainLinePath = NSBezierPath(roundedRect: mainLineRect, xRadius: 11, yRadius: 11)
    NSColor(srgbRed: 0.17, green: 0.24, blue: 0.30, alpha: 1.0).setFill()
    mainLinePath.fill()

    let subLineRect = CGRect(x: circleRect.maxX + 28, y: y - 34, width: lineWidth - 96, height: 16)
    let subLinePath = NSBezierPath(roundedRect: subLineRect, xRadius: 8, yRadius: 8)
    NSColor(srgbRed: 0.74, green: 0.78, blue: 0.80, alpha: 1.0).setFill()
    subLinePath.fill()
}

drawCheckRow(y: cardRect.maxY - 268, lineWidth: 368, tint: NSColor(srgbRed: 0.12, green: 0.64, blue: 0.49, alpha: 1.0))
drawCheckRow(y: cardRect.maxY - 430, lineWidth: 310, tint: NSColor(srgbRed: 0.12, green: 0.47, blue: 0.89, alpha: 1.0))
drawCheckRow(y: cardRect.maxY - 592, lineWidth: 406, tint: NSColor(srgbRed: 0.99, green: 0.63, blue: 0.22, alpha: 1.0))

let footerRect = CGRect(x: cardRect.minX + 76, y: cardRect.minY + 88, width: cardRect.width - 152, height: 26)
let footerPath = NSBezierPath(roundedRect: footerRect, xRadius: 13, yRadius: 13)
NSColor(srgbRed: 0.86, green: 0.89, blue: 0.90, alpha: 1.0).setFill()
footerPath.fill()

image.unlockFocus()

guard
    let tiffData = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiffData),
    let pngData = bitmap.representation(using: .png, properties: [:])
else {
    fputs("Failed to encode PNG data.\n", stderr)
    exit(1)
}

try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
try pngData.write(to: outputURL)
