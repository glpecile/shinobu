# Calendar cards move out of their slot after a date change and scrolling

## Symptom

On Firefox mobile, changing the selected date in This week and immediately
scrolling over its cards leaves a blank rail, or cards displaced and clipped
above Your Watchlist.

## Cause

The selected day's keyed `AnimatedView` entered with a custom Reanimated
`Keyframe`. In Reanimated 4.5.1's web implementation, `onanimationend` saves a
viewport snapshot, then custom-animation cleanup calls `setElementPosition`
using that snapshot. Cleanup runs after five times the animation duration
(`layoutReanimation/web/domUtils.ts`), not when the visible animation ends.

If the feed scrolls between those events, cleanup converts the rail to
`position: absolute` with an offset computed from the stale viewport position.
The reserved minimum height preserves space, but cannot preserve the cards'
position. The section's overflow clipping hides the displaced content.

A temporary route rendering the actual `UpNextSection` with seeded query data
reproduced this in headless Firefox at a 390 × 844 touch viewport. Scrolling
during and after the 180ms entrance produced an inline `top: 144px` after cleanup;
the cards stayed at their earlier viewport Y instead of following the feed.

## Fix

`dayContentAnimation` uses the built-in `FadeIn` preset on web, which bypasses
the custom-keyframe position rewrite. Native keeps its directional slide.
Reduced-motion behavior remains unchanged: Reanimated skips the web entrance
when system reduced motion is enabled. Date changes still remount the rail,
resetting horizontal scroll, and empty/populated days keep the same reserved
height.

## Verification

Use the headless workflow in `web-headless-smoke-test-playwright.md`, with the
actual section and cached calendar inputs for two populated days. Select a day,
scroll immediately, and continue past the cleanup window (900ms). Check that
cards remain in their reserved slot and follow vertical scrolling. Repeat in
both date directions, through an empty day, and with reduced motion enabled.
This desktop Firefox touch-viewport check reproduces the position bug; it does
not replace a final touch check in Firefox on a physical Android device.

The probe's in-flow/alignment assertions failed before the fix (absolute
position, 144px displacement) and passed after it in Firefox and Chromium,
including forward/backward date switches, an empty day, and reduced motion.
The temporary route and scratch script are not part of the app or test suite.
