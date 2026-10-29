// Generates schoolbellMetrics.json for the story-card layout (storyCard.ts):
// Schoolbell's per-character advance widths and vertical metrics, as
// fractions of the font size. Emoji (🔥) are measured through CoreText's
// font fallback, exactly as iOS renders them.
//
//   swift design/share-cards/schoolbell_metrics.swift > schoolbellMetrics.json
import CoreText
import Foundation

let fontURL = URL(fileURLWithPath: "assets/fonts/Schoolbell-Regular.ttf") as CFURL
guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(fontURL) as? [CTFontDescriptor],
      let descriptor = descriptors.first else {
    fatalError("run from the repo root: couldn't load assets/fonts/Schoolbell-Regular.ttf")
}
let size: CGFloat = 1000
let font = CTFontCreateWithFontDescriptor(descriptor, size, nil)

func advance(_ text: String) -> Double {
    let attr = NSAttributedString(
        string: text,
        attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font]
    )
    let line = CTLineCreateWithAttributedString(attr)
    return Double(CTLineGetTypographicBounds(line, nil, nil, nil)) / Double(size)
}

var chars = (32...126).map { String(UnicodeScalar($0)!) }
chars += ["×", "·", "…", "–", "—", "’", "é", "è", "ñ", "ü", "🔥"]

var widths: [String: Double] = [:]
for ch in chars {
    widths[ch] = (advance(ch) * 10000).rounded() / 10000
}

let metrics: [String: Any] = [
    "ascent": Double(CTFontGetAscent(font) / size),
    "descent": Double(CTFontGetDescent(font) / size),
    "capHeight": Double(CTFontGetCapHeight(font) / size),
    "widths": widths,
]
let data = try JSONSerialization.data(withJSONObject: metrics, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
