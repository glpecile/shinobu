# Pinned Settings titles judder in Firefox mobile

## Symptom

Scrolling Settings in Firefox on Android (Pixel 10 Pro XL) is choppy once a
section title pins under the header.

## Cause

Each section's pinned bar followed the scroll with a Reanimated
`useAnimatedStyle` transform (`translateY = scrollY - top`). On web that
worklet runs on the main thread. Firefox scrolls on the compositor (APZ), so
the content moves first and the JS-set transform lands one or more frames
later. That's a scroll-linked positioning effect, and the bar judders against
the rows. React wasn't involved: a full scroll made two commits.

`useAnimatedReaction` doesn't compare values. Its handler runs every time the
shared value changes, so a handler that schedules a state update has to
compare the value with `previous` itself.

## Fix

On web the bar is `position: sticky` (`web:sticky web:top-0`) inside an
absolute track the height of its section (`web:bottom-0`). It pins at the
viewport top and leaves with the section's last row, as the native transform
does, with no JS per frame. Native keeps the UI-thread transform.

## Verification

Headless Firefox (`web-headless-smoke-test-playwright.md`), 412 × 560: the
Trackers bar sits at 0px from the scroll top from scrollTop 100 to 300, and at
-34px at the section's end. Style mutations during a 120-frame scroll fell
from about 80 to 8.

Uniwind's dev stylesheet only gets a new class after `bun web` restarts.
Touching `global.css` isn't enough, so a just-added `web:` class looks
unapplied until then.
