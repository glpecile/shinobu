# A tall bottom sheet clips its content instead of scrolling

**Symptom (2026-07-26).** The log sheet became unreachable once a movie had a
few Letterboxd tags: the sheet filled the screen, the tag pills ran past the
bottom edge, and the confirm/cancel buttons underneath them could not be reached
by any gesture. Dragging the sheet body only dismissed the sheet. Short
sheets (the card-actions sheet, a TV log with no tags) were fine.

**Cause.** `detents={[0, 'content']}` is not a promise that all the content is
reachable. `@swmansion/react-native-bottom-sheet` measures the content, then
clamps that detent to a natively computed cap — the sheet's height minus the
part of the status-bar inset it overlaps:

```swift
// ios/BottomSheetHostingView.swift
let measuredContentHeight = maxHeight > 0 ? validContentHeight.map { min($0, maxHeight) } : nil
```

The children are still laid out at their full natural height inside that capped
region, so the overflow isn't dropped — it's rendered below the visible area
with nothing able to scroll it into view. Nothing in the tree was a scroller, so
the sheet's gesture negotiation had nothing to hand the drag to and treated
every vertical drag as a dismissal.

**Fix.** Put a scroller in the sheet and let it *shrink*, in
`components/sheet/index.tsx`:

```tsx
<ScrollView className="shrink" contentContainerClassName="p-6 pb-12" />
```

`shrink` (`flexShrink: 1`) is the entire fix and it needs no measured height,
because the lib already hands us a correctly sized box: it reports the content
region's inset into the shadow tree as Yoga padding on the sheet node and
renders children inside a `flex: 1` wrapper, so that wrapper is exactly the
detent cap on every device and in every presentation mode.

- content shorter than the cap → the scroller sizes to its content, the
  `'content'` detent is unchanged, short sheets look identical to before;
- content taller → flex shrinks the scroller to the cap and the overflow
  becomes scrollable.

**Don't reach for `maxHeight: windowHeight * 0.85`.** It re-derives in JS a cap
the native side already computed correctly (and guesses at the status-bar
overlap), and it pins short sheets' measurement to a magic number.

**Keyboard.** Nested-scrollable negotiation is automatic, but keyboard handling
is deliberately not — the lib is unopinionated there, so the platform split from
plan 0024 U11/R8 stands, only with scrollers:

- **Android** uses `components/keyboard-aware-scroll-view` (the withUniwind'd
  `KeyboardAwareScrollView`). Its bottom padding still grows the `'content'`
  detent to lift a *short* sheet clear of the keyboard, and once a tall sheet is
  pinned at the cap that same padding is what gives the focused field somewhere
  to scroll to.
- **iOS** keeps the plain `ScrollView`: its sheet host already moves with the
  keyboard, and a second compensation over-shoots.

Set `keyboardShouldPersistTaps="handled"` on both. With a scroller in the tree,
a tap on Confirm while the tags field is focused is otherwise swallowed as a
keyboard dismissal.

**Web** (`index.web.tsx`, an RN `Modal`, no native cap) needs the same shape
spelled out by hand: `max-h-[90%]` on the panel plus the same shrinking
scroller inside it.
