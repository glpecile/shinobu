# React holds Suspense content for 300ms after a fallback commits

**Symptom (2026-10-31).** `SuspenseSection` started holding its skeleton back
for 150ms, the way skullet does, so that a fast load would never flash one.
In a browser probe, a section whose data took 60ms still showed its skeleton:
the skeleton faded in from 150ms, and the content only replaced it at about
290ms.

## Cause

Once a boundary's fallback commits, React throttles revealing its content.
Content is held until `globalMostRecentFallbackTime + FALLBACK_THROTTLE_MS`,
and that throttle is 300ms in both `react-dom` and React Native's Fabric
renderer (`ReactFabric-*.js`). The timestamp is global, so a fallback
committing anywhere restarts the wait for every pending boundary. A load that
finishes in 60ms is still revealed at ~300ms, so any hold shorter than that
lets the skeleton show for data that had already arrived.

## Fix

`SKELETON_HOLD` in `components/suspense-section.tsx` is 300ms, matching the
throttle. React can't reveal content any earlier than that, so hiding the
skeleton for the same window costs a fast load nothing. Content that lands
within the window appears at once with no crossfade, because the skeleton was
never visible.

Check `FALLBACK_THROTTLE_MS` again after a React upgrade.

Interactive fallbacks, such as the ratings provider link, pass
`animateFallback={false}`. Opacity alone leaves a hidden control focusable,
and `aria-hidden` on an outgoing copy does not remove its descendants from
the web Tab order. These fallbacks stay visible and are never cloned.
