import AppKit
import CoreText

// usage: render.swift <fontName> <fontFile|-> <outPath> <canvasPx> <glyphFraction> <bgHex|transparent> <fgHex>
let args = CommandLine.arguments
let fontName = args[1]
let fontFile = args[2]
let outPath = args[3]
let canvas = CGFloat(Double(args[4])!)
let fraction = CGFloat(Double(args[5])!)
let bgHex = args[6]
let fgHex = args[7]

func color(_ hex: String) -> NSColor {
    var v: UInt64 = 0
    Scanner(string: String(hex.dropFirst(hex.hasPrefix("#") ? 1 : 0))).scanHexInt64(&v)
    return NSColor(srgbRed: CGFloat((v >> 16) & 0xFF) / 255,
                   green: CGFloat((v >> 8) & 0xFF) / 255,
                   blue: CGFloat(v & 0xFF) / 255, alpha: 1)
}

if fontFile != "-" {
    let url = URL(fileURLWithPath: fontFile) as CFURL
    CTFontManagerRegisterFontsForURL(url, .process, nil)
}

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(canvas), pixelsHigh: Int(canvas),
                           bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                           colorSpaceName: .calibratedRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
NSGraphicsContext.current = ctx

if bgHex != "transparent" {
    color(bgHex).setFill()
    NSRect(x: 0, y: 0, width: canvas, height: canvas).fill()
}

let fontSize = canvas * fraction
guard let font = NSFont(name: fontName, size: fontSize) else {
    FileHandle.standardError.write("font not found: \(fontName)\n".data(using: .utf8)!)
    exit(1)
}
let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color(fgHex)]
let str = NSAttributedString(string: "忍", attributes: attrs)
let line = CTLineCreateWithAttributedString(str)
// use tight glyph bounds so the ink is truly centered regardless of font metrics
let bounds = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
let x = (canvas - bounds.width) / 2 - bounds.origin.x
let y = (canvas - bounds.height) / 2 - bounds.origin.y
ctx.cgContext.textPosition = CGPoint(x: x, y: y)
CTLineDraw(line, ctx.cgContext)

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: outPath))
print("wrote \(outPath)")
