# Navigation haptics and provider log likes

## Scope

- Selection haptics on every native bottom navigation tab press, including reselects and Search.
- An outlined/filled heart to the right, outside the watched-date pill, in the shared log form when Letterboxd or Serializd is selected. It applies to the selected compatible providers, not other trackers.
- Keep the choice with the form through partial-failure retries; reset it for a new log. Catch-up logs carry the choice through their chain.
- Pass the choice through the existing diary payloads on Serializd, native Letterboxd, and the web userscript. No new endpoints or proxy writes.
- A brief transform-only heart pop on liking, using Reanimated CSS keyframes, disabled for reduced motion; existing button press feedback remains.
- Userscript 0.6.0 advertises like support; old scripts keep logging but cannot silently accept a liked log.
- Diary rows show a small filled accent heart before the time/provider marks when a contributor reports a like. Read Letterboxd RSS `memberLike` and Serializd diary `like` during the existing refresh, never blocking the write. Collapsed episode runs indicate that at least one log is liked; expanded rows keep their individual state.

## Validation

Extend existing provider payload and userscript round-trip tests for true/default-false likes and old-script protection. Run typecheck, lint, repository checks and tests. Native haptics need device verification; no native rebuild is required.
