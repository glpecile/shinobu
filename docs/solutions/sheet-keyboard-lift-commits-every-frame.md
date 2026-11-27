# The sheet's keyboard lift commits the shadow tree on every frame

**Symptom (2026-11-27, Pixel 8 Pro).** Opening the keyboard in the log sheet's
tags field dropped frames on Android.

## Cause

`Sheet` lifted its host with an animated `bottom`, driven per frame by
`useReanimatedKeyboardAnimation`. Call-stack sampling during the keyboard
animation put most of each `insets_animation` callback in Reanimated's
`performOperations` → `ShadowTree::commit` → mount → `View.layout`. With its
default flags, Reanimated on Android commits the React shadow tree for every
animated prop, transform included, so each keyboard frame relaid out the sheet.

Ruled out on the same device: JS (idle for the whole animation), the closed
sheets' re-renders (PR #519), and the Settings and Search keyboard-avoiding
views (same cost with only Home mounted).

## Fix

- `Sheet` moves its host with `translateY`, not `bottom`.
- `package.json` sets Reanimated's static flag
  `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS`, so a transform reaches the view
  without a commit. The flag is read at native build time: a change needs
  `bun android:clean`. It applies to every Reanimated animation of `transform`,
  `opacity` and colors on Android.
- The lift no longer shrinks the host, so `SheetContent` lowers its height cap
  by the keyboard height once, when the keyboard shows. A tall sheet still
  scrolls its last control above the keyboard.

## Measurement

Release builds (`assembleRelease`, arm64), Pixel 8 Pro at 120 Hz, Android 17
beta. Perfetto frame timeline for 1.2 s after the tap that focuses the tags
field, 8 runs each in two alternating install blocks:

| | Before | After |
|---|---|---|
| Frames with `App Deadline Missed` (median, mean) | 3, 3.1 | 0.5, 1.1 |
| Frames drawn | ~81 | ~85 |
| Mount time | 52–69 ms | 26–30 ms |
| Worst `insets_animation` callback | 12–15.5 ms | 5–6 ms |

Not measured: iOS frame timing (the iOS flag stays off, and a transform there
still commits like `bottom` did), and other screens' animations under the new
flag. `insets_animation` still totals about 120 ms per opening, mostly the
keyboard controller's own event dispatch.
