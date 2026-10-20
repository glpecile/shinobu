# iOS shifts a single-line TextInput with the line-height, not the padding

**Found 2026-10-20** on the search field (RN 0.86, Fabric, iOS 26.5). `text-base`
sets a 24px line-height on the 16px font. In the 44pt pill the text's baseline
sat 11pt below the field's midline, visibly lower than the search icon and clear
button.

`ios:py-0` does not fix it. It shortens the field to `min-h-11`, but the text
keeps the same offset and looks *more* off-center in the smaller pill.

The offset follows the line-height, so the correction is a line-height too, not
padding:

| line-height | result |
| --- | --- |
| `text-base` (24px) | baseline 11pt low |
| `leading-none` (16px) | text body ~2pt high |
| `leading-4.5` (18px) | x-height centered on the midline |

**Fix:** `leading-4.5` on the input. The field keeps `py-3` and `min-h-11`
(settling at 44pt), and the text centers against the icons on iOS and Android.

**Why it's not obvious:** the line-height offsets the text asymmetrically on
iOS, and `textAlignVertical` is Android-only. Inspect the glyph rows, not the
`AXTextField` frame — the frame stays centered while the text inside it does
not. `leading-none` overshoots, so don't assume "smaller line-height" means
"more centered".
