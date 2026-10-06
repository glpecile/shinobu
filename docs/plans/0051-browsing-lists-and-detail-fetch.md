# Browsing lists and cold detail fetches

## Scope

- Start public TMDB, AniList and Simkl detail reads immediately when an ID
  misses the caches, without waiting for unrelated Home requests. Keep cached
  personal items ahead of fetched catalogue records as feed data arrives.
- Virtualize Continue Watching and the selected This Week day's card rail with
  the existing List wrapper. Keep show/group keys, actions, stack headroom,
  day transitions, trailing fades and non-recycled card state.
- Search already uses a single virtualized List for titles, people and studios.
  Supply a row-size estimate and separate row types for its mixed-size sections;
  do not replace working virtualization or enable stateful row recycling.
- No sheet lifecycle, provider, dependency or cache-retention changes.

## Validation gate

Per the owner's direction, finish verification through a focused code sweep,
repository checks and the delegated ponytail review, without further screenshots
or Argent testing. Do not claim FPS or latency improvements.

The sweep covers public-ID query enabling independent of feed loading, unchanged
cache precedence and query deduplication, stable show/group keys, non-recycled
card state, bounded font-scaled rail height, stack headroom, empty/populated day
height parity, and the existing flat search list across all three scopes.

Before device verification was stopped, Android mounted 3 cards for the 6-item
Continue Watching rail; horizontal scrolling and switching between an empty day
and a populated day rendered correctly. This is limited structural evidence,
not an A/B performance benchmark. The unfinished recorder output was discarded.

`bun lint`, `bun typecheck`, classnames, router-push, links, `git diff --check`
and all 1,250 existing tests passed. Delegated ponytail review approved the
updated diff after the redundant day-height measurement was removed. JS-only:
hot reload, no native rebuild.
