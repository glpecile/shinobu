# Letterboxd series completion logging

- Require a TV entry with a confirmed `tmdbTvVariant` Letterboxd relationship,
  TMDB ended/canceled status, a nonempty complete regular-episode catalogue,
  and watched evidence for every aired regular episode. Never treat caught-up
  returning series, missing data, or a matched movie as complete.
- Reuse provider progress queries; successful confirmed episode writes can
  supplement the pre-write snapshot when checking a settled batch or chain.
- After a clean episode chain or season batch completes the series, retain the
  sheet with an optional Log on Letterboxd action. Already-complete rewatches
  do not offer another whole-series log after their first episode.
- Offer the same action on completed TV detail pages. Open the existing movie
  confirmation with the Letterboxd identity, only Letterboxd as a target, and
  no episode payload. Keep date, tags and like choices from the episode log.
- No automatic Letterboxd write, no episode fan-out to Letterboxd, no proxy or
  native dependency changes. Existing manual links, errors and retries apply.
- Validate completion boundaries, provider restriction, normalizer and existing
  logging tests, lint/typecheck and visible confirmation. Open a PR for both
  phases after validation. JS-only: hot reload, no native rebuild.

## Verification

- `bun test --isolate`: 1,363 passed. Completion boundaries, finale snapshot
  supplementation, rewatch suppression and Letterboxd-only adapter delivery pass.
- `bun lint`, `bun typecheck`, `bun check:classnames`,
  `bun check:router-push`, `bun check:links` and `git diff --check` pass.
- Live TMDB metadata confirms Beast Boy: Lone Wolf is Ended with 10 episodes.
  Its TMDB detail page renders in simulator Safari. Signed-in completion-sheet
  interaction remains unverified; no live provider writes were performed.
