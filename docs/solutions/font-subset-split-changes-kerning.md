# Splitting a web font behind `unicode-range` changes how text renders

**Symptom:** With each family split into a preloaded core (ASCII plus common
punctuation) and an extended file behind `unicode-range`, the pixel diff
against the unsplit font showed "Pokémon · Amélie · Té Yé…" several CSS px
wider at 13px, and `1⁄2` stopped composing into ½.

**Cause:** The browser picks a face per character by `unicode-range` and shapes
each face's run separately. GPOS kerning, `calt`, and the `numr`/`dnom`
HarfBuzz applies around U+2044 only work between glyphs in the same file. Moving
all Latin into the core isn't enough either. Inter's kerning classes pair
quotes, parentheses, `.`, `,`, digits, `«»` and `·` with Greek and Cyrillic
letters, and Latin letters with `−`, `≤`, `≥`, arrows and `™`. So any split
changes some real provider text, such as `«Москва»` or `“Ф.”`.

**Fix:** `scripts/subset-fonts.py` ships one woff2 per family. Every glyph stays,
and unused features and hinting go. The specimen and app pages diff at 0 px
against the original TTFs.

**Measured split options (woff2 bytes, Inter 400 / Space Grotesk 700):**

| Split | Preloaded core | Extended | What changes |
| --- | --- | --- | --- |
| None (shipped) | 98,204 / 22,912 | none | nothing |
| Latin core, Greek, Cyrillic and symbols extended | 52,732 / 21,452 | 53,840 / 2,876 | Greek and Cyrillic next to punctuation or digits, and `−≤≥→™` next to letters |
| ASCII core | 12,980 / 7,292 | rest | kerning around every accented letter, `1⁄2` |

Inter Italic and SemiBold come within about 5% of Inter 400.

Web's static HTML declares and preloads the faces. The client registers the
same URLs with `useFonts` to hold the splash until downloads finish. Keep the
web app rendered beneath that splash on both the server and client, or the
font wait changes the first client tree and breaks hydration. Don't register
these faces through expo-font during SSR: its `isLoaded` checks for its own
style rules and treats them as loaded before their files arrive.

The generator embeds the full source licenses in name ID 13 of every output,
so both native binaries and standalone web font downloads carry the terms.
The size measurements above precede that license embedding.
