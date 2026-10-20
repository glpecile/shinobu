# A line-height on a single-line iOS TextInput shifts the text off-center

**Found 2026-10-20** on the search field (RN 0.86, Fabric, iOS 26.5). `text-base`
sets a 24px line-height on the 16px font. In the 44pt pill the text sat 11pt
below the field's midline, visibly lower than the search icon and clear button.

Any explicit line-height moves the glyphs inside UITextField's line box, so
tuning it never lands right. `leading-4.5` (18px) got the ascender-to-baseline
block close, but the caret overhung below the glyphs and lowercase text read
high. `leading-none` reads higher still. `ios:py-0` just shrinks the pill.

**Fix:** give the input no line-height at all, and center it by height instead
of padding: `text-[16px] h-11 py-0`. UITextField then centers the font's own
line box, so the glyphs and caret land on the midline (measured to the pixel on
iPhone 17 Pro). Android centers single-line EditText text the same way.

**Why it's not obvious:** `text-base` carries a line-height with it, and
`textAlignVertical` is Android-only. Inspect the glyph rows in a full-scale
screenshot, not the `AXTextField` frame. The frame stays centered while the text
inside it does not. Without a line-height, `py-3` plus Inter's natural line box
grows the field to ~50pt, so use a fixed height.
