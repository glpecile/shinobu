# Logging triggers share an app-level session

The details CTA, season rows, and episode screen used the same confirmation
view but each owned a separate form and mutation handler. Continue Watching
used a different session, so only that trigger offered subsequent episodes.
Even diary-tag defaults had drifted.

All triggers now send a `LogRequest` to the app-level host in `_layout.tsx`.
Single-episode requests use `CatchUpSession`, preserving the existing frozen
queue, concurrent writes, final-write wait, provider-specific retry, and Simkl
coalescing. The episode screen does not navigate away after a clean first write.
Movies, anime films, and explicit season batches use the state-owning `LogConfirmSheet`.
A season batch remains one-shot even if it contains just one aired episode.

Detail-page queues use catalogue air dates and live watched state in the
request's numbering domain. Undated anime episodes retain the existing release
evidence fallback (`anilist-undated-episodes-arent-proof-of-airing.md`); Simkl
can additionally bound them with its aired count. Unknown/failed evidence never
fabricates subsequent episodes. Session-bound closing prevents a late result
from dismissing a newer logging sheet.
