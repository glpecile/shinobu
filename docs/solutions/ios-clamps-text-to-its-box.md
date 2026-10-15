# iOS clamps a paragraph to the box it's in

`ExpandableText` collapsed to a fixed-height box (`height: lines * LINE_HEIGHT`,
`overflow-hidden`) and measured the text inside it with `onLayout`. On web that
works: the browser lays the paragraph out in full and lets it overflow. On iOS
the text is laid out to *fit* the constrained box, so a 64-line biography
reported four lines — `fullHeight` never exceeded the clamp, the Read more
toggle never rendered, and the last visible line was cut mid-sentence with no
ellipsis.

Two follow-on traps found while fixing it (RN 0.86, Fabric, iOS 26):

- `onTextLayout` on a `numberOfLines`-clamped `Text` reports the **truncated**
  lines, so `lines.length > limit` can never detect overflow.
- `lines[i].text` is empty on Fabric, so comparing rendered characters against
  the source doesn't work either.

**Fix:** native clamps with `numberOfLines` (which also restores the ellipsis)
and measures the real length from a second, unconstrained copy — absolutely
positioned, `opacity-0`, `pointerEvents="none"`, hidden from VoiceOver. It
wraps at the same width as the visible copy. Compare the hidden copy's full
height against the collapsed copy's height using `onLayout` on their wrapping
Views. This also works for `EnrichedMarkdownText`, which has a native line
clamp but no `onTextLayout`. Keep the collapsed measurement while expanded so
the disclosure stays available to collapse it again. Web keeps the height
transition in `expandable-text/index.web.tsx` and measures a wrapping View,
which resizes after the Markdown renderer's asynchronous WASM parse.
