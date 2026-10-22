# Detail navigation performance

Preserve press-in screen preloading and iOS poster zoom. Expo Router's installed
stack router promotes the hidden route by screen name and optional `getId`, then
replaces its params. Adding `zoomPoster` does not require a second screen.

## Changes

- Share public Simkl identity requests between detail resolution, variant posters
  and log enrichment. Preserve the mapping caller's miss and cancellation rules.
- Feed the detail title's native scroll offset through Legend List's supported
  Reanimated integration. Keep web's scroll-based unfold reset and native's
  drag-based reset.
- Keep cache resolution precedence, provider fan-out and storage unchanged.

## Validation

Measure duplicate lookup request counts at the HTTP boundary. Compare the same
native detail navigation and scrolling path before and after, checking title
tracking, back navigation, poster zoom and repeated taps. Run existing unit
tests, lint, typecheck and repository guards. Record measurement limitations;
simulator development builds cannot establish release-device latency or an
app-wide absence of bugs.
