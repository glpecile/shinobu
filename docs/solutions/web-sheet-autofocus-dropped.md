# `autoFocus` inside a web sheet is silently dropped

**Symptom (2026-09-17).** A `TextField` with `autoFocus` in the Manage Trackers
provider sheet never took focus on web. With a plain retry it focused on a fresh
page but failed intermittently when a sheet reopened.

## Cause

Two layers hide the field at the moment React calls `focus()`, and a browser
drops focus on a hidden element without an error:

1. react-native-web's `Modal` (`ModalAnimation`) renders its first frame with
   `display: none` and only shows the content from an effect.
2. Reanimated's web `entering` renders the element with `visibility: hidden`
   (`AnimatedComponent`, "Hide component until `componentDidMount` triggers")
   and resets it in the element's own `onanimationstart`, which starts on a
   `requestAnimationFrame`.

Focusing on layout or from an effect races the second step.

## Fix

`Sheet` on web takes `autoFocus`. A ref callback on the overlay listens for
`animationstart` in the bubble phase. That runs after Reanimated's handler on
the target has revealed the element. It focuses the first `input`/`textarea` and
unsubscribes once `document.activeElement` is that field
(`src/components/sheet/index.web.tsx`). Touch browsers are skipped
(`src/lib/pointer.ts`).
