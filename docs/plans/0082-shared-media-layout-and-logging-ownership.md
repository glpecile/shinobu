# Shared media layout and logging ownership

Scope confirmed against clean HEAD `e5fc58b`, compared with snapshot `1074209`.

- Move shared logging session modules from Up Next into `features/log-media/session`.
  Retain the separate root host, inline content, state, and episode queue rules.
- Move poster-wall and row layouts into `features/media-layout`. Screens retain
  data, paging, filtering, errors, and navigation; watchlist entries retain their
  existing provider-membership contract.
- Share only small-poster image/placeholder rendering. Callers keep recovery
  hooks, including the diary's details fallback, and existing sizes.
- Correct comments that incorrectly claim watchlist and diary use the same row.

The card actions button is already shared since the snapshot. Do not change its
interaction, logging behavior, provider writes, cache invalidation order, Home
rows, or storage.

Validation: existing logging, watchlist, diary, Up Next, and season-row tests;
`bun typecheck`, `bun lint`, and class-name/navigation/link checks. No live-account
or device behavior is claimed. Changes are JS-only; no native clean build needed.
