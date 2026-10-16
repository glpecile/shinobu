# Diary trailing metadata and list-tab loading flashes

## Firefox diary overlap

The diary's web `ActionableRow` splits the title and trailing metadata into
separate pressables. Giving the trailing pressable `flex-1` makes its flex basis
zero: Firefox grants space to the title and then paints the timestamp over it.
Keep the trailing content's intrinsic width (`grow shrink-0`), let the leading
pressable shrink (`min-w-0`), and keep the actions slot fixed-width.

A 390×844 Firefox touch-viewport check reproduced a title ending at x=326 while
its timestamp began at x=300 before the repair. The same real-component check
passes after it in Firefox and Chromium, including a collapsed episode count.

## Android list-tab flashes

ffmpeg frame extraction from the owner's 2026-10-15 recording showed poster
strips disappearing on repeated created/liked tab switches, plus the platform
refresh indicator over the first card. `ListsPager` discarded every inactive
wall even though `Pager` retains neighbours. Keep each wall after its first
visit; do not mount an untouched wall, because that starts concurrent
Letterboxd requests. RefreshControl must track an explicit pull's promise, not
background query refetching on a remount.

The real pager passed a state-retention check in Firefox and Chromium: increment
a wall-local counter, switch to liked lists and back, and retain its value.
The Android emulator was visible to adb but Argent's package-resolution and
activity-launch calls failed, so this does not establish physical Android
gesture or indicator behavior. Recheck horizontal swipes and pull-to-refresh
on the owner's Pixel.

## Other checks in this batch

Temporary real-component previews verified the discussion options trigger's
busy/disabled state through refresh completion, a 56px scroll-to-top FAB, and
asynchronously arriving `24 min/episode · 96 min total` text with a 180ms
opacity animation (0ms under reduced motion). Its row reserves one line while
metadata loads, keeping the actions below it steady. The actual Search screen passed
placeholder-fit and clear-button checks at the same mobile viewport. Both
browsers reported no page errors. The preview route was removed after testing.
