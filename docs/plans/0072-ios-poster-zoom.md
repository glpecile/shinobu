# iOS poster zoom transitions

Issue: #210. Use Expo Router's supported `Link.AppleZoom` and
`Link.AppleZoomTarget` APIs (installed SDK 57), not custom shared elements.

## Scope

- MediaCard posters in home carousels, related media, and filmography
  zoom into the detail poster on iOS 18+. Keep the existing headerless stack
  and interactive native dismissal; do not add Link.Preview or modals.
- Let MediaCard own its details destination instead of passing identical push
  callbacks through each carousel. Android/web keep PresstableScale and
  usePushRoute, including modifier-click and long-press actions.
- iOS uses Link with a core Pressable: pressto emits animation options, not the
  cancellable press event Link requires. Share usePushRoute's module-level
  duplicate-push guard with the Link, keyed by the public destination rather
  than Expo's per-source internal zoom parameters.
- Only enable zoom after source artwork is displayed. Missing, failed, or
  still-loading artwork and Reduce Motion use normal stack navigation.
- Carry the displayed source poster URI to the iOS destination so TMDB metadata
  enrichment cannot swap the poster mid-transition. Keep the destination's
  measured poster box available in its loading skeleton as well.
- No dependency/native changes. Row-only navigation, Up Next cards, and other
  destinations are outside this version.

## Validation

- Typecheck, lint, route/class/link checks, and existing navigation tests.
- On an available iOS 18+ simulator: open/back from a loaded poster, interactive
  dismissal/cancellation, rapid taps (including duplicate cards), long-press
  actions, and reduced motion. Check cold/missing artwork fallback.
- Confirm Android/web paths retain their existing pressables and destinations.
  Report device verification limitations explicitly in the PR.
