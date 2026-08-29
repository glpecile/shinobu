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
  scroll to. **`scrollEnabled` must also flip on while the keyboard is visible**
  (2026-08-17): edge-to-edge Android never resizes the window for the soft
  keyboard, so `maxHeight` — derived from `useWindowDimensions` — still
  describes the full screen while the keyboard covers the sheet's lower half. A
  sheet whose content "fits" therefore kept `scrollEnabled: false`, and the
  KeyboardAwareScrollView had no way to bring the focused tags field or the
  confirm buttons out from behind the keyboard. The sheet now ORs
  `useKeyboardState((s) => s.isVisible)` into the Android branch's
  `scrollEnabled`. **Known gap:** a *short* sheet now has no scroller at all, so it no
  longer grows to lift itself clear of the Android keyboard. Nothing ships in
  that shape today (every sheet with a text field — the log sheet's tags, the
  Trakt/AniList credential forms — is tall enough to take the scroll branch), but
  a short sheet with an input would need a `KeyboardAvoidingView` on the hugging
  branch.

  **`bottomOffset` must clear what renders *under* the input, not just the
  input** (2026-08-28). With `bottomOffset={24}` the auto-scroll parked the
  focused tags field flush against the keyboard, which is exactly where its
  suggestion chips and "Show more" toggle live — so the keyboard buried them
  every time, and the user had to scroll by hand to see the tags they were
  picking from. The offset is now 120: one collapsed chip row plus the toggle
  (~90dp) plus margin. The extra offset is harmless for inputs with nothing
  below them — the scroll clamps to the KeyboardAwareScrollView's own keyboard
  padding.

  **Do NOT "fix" this by growing the sheet instead** (2026-08-28). The obvious
  better UX — add the keyboard height to the scroller's explicit `height` so
  the bottom-anchored sheet lifts its whole form clear of the keyboard — was
  built and reproducibly **segfaulted Fabric** on Android
  (`SIGSEGV in facebook::react::ShadowNode::getTag`, reached from
  `UIManager::findShadowNodeByTag_DEPRECATED` — keyboard-controller's
  focused-input measurement racing the shadow tree). Resizing the subtree the
  native `'content'` detent measures *while the keyboard event is in flight*
  makes the sheet re-measure and re-snap mid-transaction; combined with
  react-native-keyboard-controller's concurrent shadow-node lookups this
  crashed the app within seconds of focusing the tags field, on two separate
  attempts. The same crash signature also fired once with a main-equivalent
  build while the IME process was force-restarted under a focused input, so
  the underlying race is not ours — but resizing the sheet on keyboard
  show/hide is a reliable trigger for it. The sheet's height must depend only
  on its content; the keyboard may only ever move the *scroll offset*.
- **iOS** keeps the plain `ScrollView`: its sheet host already moves with the
  keyboard, and a second compensation over-shoots.

Set `keyboardShouldPersistTaps="handled"` on both. With a scroller in the tree,
a tap on Confirm while the tags field is focused is otherwise swallowed as a
keyboard dismissal.

**Web** (`index.web.tsx`, an RN `Modal`, no native cap) needs the same shape
spelled out by hand: `max-h-[90%]` on the panel plus the same shrinking
scroller inside it.
