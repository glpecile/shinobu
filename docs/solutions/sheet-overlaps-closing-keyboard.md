# A sheet opened from a focused field overlaps the closing keyboard

**Symptom (2026-11-10, Pixel 8 Pro).** With the search keyboard up, pressing
the search-scope Fab drew the picker sheet on top of the keyboard. The sheet
then rode the keyboard down and restarted its entrance from the bottom.

## Cause

`Sheet` lifts its host by the keyboard height, frame by frame, so a field
inside the sheet stays above the keyboard. `Keyboard.dismiss()` starts a
~250 ms slide, so a sheet opened in the same press is lifted by a keyboard
that is still closing. Without the lift, the sheet rises behind the keyboard,
because Android draws the IME in its own window above the app.

Waiting for the keyboard (`await KeyboardController.dismiss()`) removed the
overlap but cost about 580 ms between the press and the sheet: the slide, plus
about 330 ms before `keyboardDidHide` reached JS in a dev build.

## Fix

`dismissKeyboardNow()` (`src/lib/keyboard.ts`) calls
`KeyboardController.dismiss({ animated: false })`. On Android 11+ that ends
the IME inset animation at once, before the sheet's first frame renders, so
the press can open the sheet in the same handler. On a recording, the sheet
started about 100 ms after the press, with no frame showing both. The
controller's dismiss is a no-op on web, so the helper calls `Keyboard.dismiss()`
there.

Use it wherever a press opens a sheet over a screen that can have the keyboard
up (the search Fab and `useCardActions`).
