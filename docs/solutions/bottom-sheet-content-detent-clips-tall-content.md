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

**First fix (2026-07-26), and why it was wrong.** Put a scroller in the sheet and
let it *shrink*:

```tsx
<ScrollView className="shrink" contentContainerClassName="p-6 pb-12" />
```

The reasoning was that the lib hands us a correctly sized box — it reports the
content region's inset into the shadow tree as Yoga padding and renders children
inside a `flex: 1` wrapper — so a shrinkable scroller would size to its content
while it fits and clamp to the cap when it doesn't.

**It doesn't, and it silently broke every short sheet.** From the moment that
shipped, *all* sheets opened full-screen regardless of content: a two-line
provider sheet filled the display. The `'content'` detent is measured from this
subtree, and **a `ScrollView` has no intrinsic height to report — it always
answers "as much as you have"**. Measured on an Android emulator, none of these
changed the sheet by a pixel:

| attempt | result |
| --- | --- |
| `className="shrink"` (`flexShrink: 1`) | full screen |
| `+ grow-0` / `style={{ flexGrow: 0 }}` — RN's ScrollView ships `flexGrow: 1` in `styles.baseVertical`, so this looked promising | full screen |
| `+ style={{ maxHeight }}` | full screen |
| plain `<View>`, no scroller (control) | **hugs content** |

**Actual fix.** Keep the scroller out of the tree until it is needed. Render the
children in a plain `View`, watch its laid-out height, and only wrap in a
scroller once that exceeds the cap:

```tsx
const body = <View className={CONTENT_PADDING} onLayout={measure}>{children}</View>;
if (!overflows) return body;                       // hugs content
return <ScrollView style={{ maxHeight }}>{body}</ScrollView>;   // caps + scrolls
```

The measurement stays live inside the scroller (children still lay out unbounded
in a scroll view), so content that shrinks again drops back to hugging, and the
two branches settle instead of oscillating.

`maxHeight` here is `windowHeight * 0.85` — a JS re-derivation of a cap the
native side computes more precisely, which is a real wart. It is only ever
applied on the overflow branch, where being slightly under the native cap is
harmless (the scroller appears a little early rather than the sheet clipping),
and the hugging branch — the common one — uses no magic number at all.

**Keyboard.** Nested-scrollable negotiation is automatic, but keyboard handling
is deliberately not — the lib is unopinionated there, so the platform split from
plan 0024 U11/R8 stands, only with scrollers:

- **Android** uses `components/keyboard-aware-scroll-view` (the withUniwind'd
  `KeyboardAwareScrollView`) on the overflow branch: once a tall sheet is pinned
  at the cap, its bottom padding is what gives the focused field somewhere to
  scroll to. **Known gap:** a *short* sheet now has no scroller at all, so it no
  longer grows to lift itself clear of the Android keyboard. Nothing ships in
  that shape today (every sheet with a text field — the log sheet's tags, the
  Trakt/AniList credential forms — is tall enough to take the scroll branch), but
  a short sheet with an input would need a `KeyboardAvoidingView` on the hugging
  branch.
- **iOS** keeps the plain `ScrollView`: its sheet host already moves with the
  keyboard, and a second compensation over-shoots.

Set `keyboardShouldPersistTaps="handled"` on both. With a scroller in the tree,
a tap on Confirm while the tags field is focused is otherwise swallowed as a
keyboard dismissal.

**Web** (`index.web.tsx`, an RN `Modal`, no native cap) needs the same shape
spelled out by hand: `max-h-[90%]` on the panel plus the same shrinking
scroller inside it.
