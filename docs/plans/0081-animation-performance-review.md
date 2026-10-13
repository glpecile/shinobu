# Animation performance review

Emil design-engineering review of shared components, features, native motion,
and web motion. Preserve existing timing tokens, native navigation, mounted
pager neighbours, and disclosures that must move surrounding content.

## Findings and fixes

| Before | After | Why |
| --- | --- | --- |
| Web Diary supplies an always-on row layout transition | Reflow only on native | Initial measurements compete with the section entrance; web layout animations scale text (see `diary-disclosure-keeps-flat-virtualization.md`) |
| Neighbouring seasonal pages pulse their loading blocks | Static offscreen skeletons, visible page still pulses | Up to 48 invisible loops in list mode; keep pages mounted for smooth swipes |
| Empty-state tiles bob with reduced motion enabled | Static tilted tiles | Decorative CSS loops do not inherit timing animations' reduced-motion handling |
| Diary rail endpoints animate height | Top-anchored scaleY | Identical childless hairline without per-frame layout |
| Episode pager exposes neighbouring page content to accessibility | Hide non-active pages from accessibility | Match the shared pager's one-page accessibility contract |

## Investigate separately

- Nested web page/content blur entrances: duplicate filtered surfaces are
  confirmed, but a browser recording is needed before changing the loading
  reveal contract.
- Details and credit lists feed title scrolling through JS. Their virtualizer
  also consumes scroll events; verify its supported event-composition path
  before moving the animation input to UI.
- Anchor measurement synchronously reads a shared value on JS, but it is not
  per-frame. Scheduling just its calculation on UI was rejected in review:
  measured coordinates and scroll offset can come from different frames. Keep
  the current snapshot until measurement and scroll sampling can move together.
- Initial button-icon fades are redundant inside sheets, but preserving
  subsequent loading/icon swaps needs lifecycle evidence before changing them.
- Credit refocus drives per-row blur on web. Profile filtering on a large
  filmography before replacing it.

## Evidence and validation

- Baseline `bun lint` passes.
- Preliminary iPhone 17 Pro simulator development capture: 19 React commits,
  two over 16ms; Home disclosure commit 31.49ms, background Diary commit
  169.76ms. No native hotspots or hangs reported. Background provider updates
  and profiler instrumentation confound attribution; not a production FPS
  benchmark. Runtime entries show compiled app components despite the report's
  contradictory global compiler warning. Do not add manual memoization.
- Argent's combined report cannot join the React logical device id with the
  native simulator UDID on shared Metro. Keep the individual reports separate.
- Validate static loop elimination and reduced-motion behavior, replay the
  recorded read-only path, and run repository tests, typecheck, lint and web
  export. No native dependency/configuration changes: hot reload only.

### Completed validation

- `bun run test`: 1,412 pass, zero fail. Use the script, not bare `bun test`:
  the script enables mock isolation, as CI does.
- Typecheck, lint, class-name check, route-push check, and web export pass.
- `.argent/flows/animation-review-navigation.yaml` replays on iOS: Home
  disclosure expands/collapses, then Diary opens. Semantic text taps replaced
  the recorder's incorrect coordinate fallback. Diary identity stays a raw
  accessibility wait because the runner's role projection differs. The final
  idle gate warns about a small changing region; no following action depends
  on it, and this is not claimed as a loading-complete assertion.
- Post-fix development profile (`20261013-031724`): 38 React commits, two over
  16ms (26.82ms card mount, 19.62ms tab navigation). Native Instruments again
  reports zero hotspots/hangs. This wider replay is not comparable to the
  preliminary one-action capture; no timing improvement claim.
- Runtime inspection on Anime Seasons confirms `WallSkeleton` fallback props:
  active page `animated: true`, mounted neighbour `animated: false`. Cached
  pages had resolved, so invisible-loop removal is verified structurally,
  not through a loading-state CPU comparison.
- Episode smoke check confirms only the active page is accessible, and
  Previous moves that isolation to the newly selected episode. No log writes.
- Runtime logs contain no errors and one Reanimated shared-value-read warning
  during Anime Seasons mount. None of the retained fixes reads a shared value;
  trace that existing pager/season path separately without disabling warnings.
- Reduced-motion tile behavior is code-reviewed; physical-device accessibility
  and release-build FPS testing remain outstanding.
