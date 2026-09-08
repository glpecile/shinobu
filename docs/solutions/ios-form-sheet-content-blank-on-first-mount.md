# iOS `presentation: 'formSheet'` with numeric detents mounts blank

## Symptom

`/episode/[id]` registered in `app/_layout.tsx` with
`presentation: 'formSheet', sheetAllowedDetents: [0.7, 1]` opened as an empty
dark sheet with only its absolutely-positioned close button. The React tree
(`debugger-component-tree`) was complete and laid out — still, heading, logs,
cast rails all present with frames — but nothing painted. Any re-render
(Fast Refresh, an edit to the file) made the content appear; closing and
reopening the route was blank again. Expo SDK 57 / react-native-screens 4.26.2
/ iOS 26.

## Cause

`ScreenStackItem.getPositioningStyle` (react-native-screens) wraps form-sheet
content on iOS in `position: absolute; top/start/end: 0` **with no bottom and
no height** unless the experimental `synchronousScreenUpdatesEnabled` feature
flag is on. A `flex: 1` root then resolves to 0 height on first mount and the
`ScrollView` inside clips everything. The later re-render happens to run a
layout pass with the sheet's real size.

Giving the root an explicit `height` from `useWindowDimensions` made the first
mount paint, but a scroll-to-edge then expanded the sheet with the same stale
layout, and the image lightbox (Galeria) rendered inside the sheet's clip.

## Fix

Present the route as `presentation: 'modal'` (the stable native page-sheet
card) instead of `formSheet`. Same swipe-to-dismiss, no detents, `flex: 1`
lays out normally, and no feature-flag experiment in the app root. If a real
form sheet is wanted later, spike `featureFlags.experiment.synchronousScreenUpdatesEnabled`
first and re-check the lightbox inside it.
