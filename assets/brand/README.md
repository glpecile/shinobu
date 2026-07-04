# Brand assets generator

The app icon / splash / favicon (`assets/images/*.png`) are a red (`#DC2626`,
the `accent` theme token) 忍 set in **Yuji Boku** (Google Fonts, SIL OFL).
`YujiBoku-subset.ttf` is a single-glyph subset of that font; `render.swift`
re-renders any asset from it (macOS only):

```sh
swift render.swift "Yuji Boku" YujiBoku-subset.ttf out.png <canvasPx> <glyphFraction> <bgHex|transparent> <fgHex>
```

Recipes used for the current assets (from this directory, output to `../images/`):

| asset                         | canvas | fraction | bg          | fg     |
| ----------------------------- | ------ | -------- | ----------- | ------ |
| icon.png                      | 1024   | 0.62     | FFFFFF      | DC2626 |
| ios-icon-dark.png             | 1024   | 0.62     | transparent | DC2626 |
| ios-icon-tinted.png           | 1024   | 0.62     | transparent | 8E8E93 |
| adaptive-icon.png             | 1024   | 0.45     | transparent | DC2626 |
| adaptive-icon-monochrome.png  | 1024   | 0.45     | transparent | FFFFFF |
| splash-icon.png               | 1024   | 0.90     | transparent | DC2626 |
| favicon.png                   | 48     | 0.90     | transparent | DC2626 |

The Android adaptive foreground uses a smaller fraction (0.45) so the glyph
fits inside the adaptive-icon safe zone (a centered circle ~66% of the canvas).
