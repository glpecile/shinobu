# List index swipe paging

Enable native left/right paging between Your Lists and Liked Lists for
Letterboxd and Serializd by extracting and reusing the anime seasons pager. Keep the
filter outside the pages, synchronize `?kind=` without pushing a route, and
keep both pages mounted so vertical positions survive a switch. Each page
retains its own skeleton, retry, and provider link. Web keeps tap-only switching
so trackpad gestures still belong to browser navigation, like the season pager.

Keep the existing pager's measured viewport, resting contentOffset for Android,
reduced-motion handling, web timing, and neighbour mounting unchanged. Hide
inactive pages from accessibility. No provider, dependency, or native
configuration changes.

Validate repository checks and tests, then check native swipe/tap switching,
vertical scrolling, direct liked links, and page-local recovery where available.

## Validation

- Typecheck, lint, class-name/navigation/link checks, all 1,333 isolated tests,
  and the production web export pass.
- iPhone 17 Pro: Letterboxd swipes both ways and tab-tap switching pass the
  recorded `.argent/flows/list-kind-pager.yaml` replay. The created tab is empty;
  the liked tab renders its list card. The final idle check reported minor
  changing pixels; subsequent screen inspection confirmed a rendered card,
  selected Liked Lists control, and provider link rather than a loading screen.
- The extracted anime seasons pager still swipes from Fall to Summer with the
  selected segment and poster wall following it.
- The flow uses whole-screen directional swipes because the pageable viewport
  has no semantic accessibility node. Its header checks are the swipe verdicts.
  Replay from a loaded Letterboxd Your Lists screen with a connected account:
  `argent flow run list-kind-pager --device <ios-simulator-udid>`.
- Long-list vertical position retention, Serializd, Android, reduced motion,
  and page-error recovery were not exercised on-device in this session.

JS-only: hot reload applies; no clean native build is needed.
