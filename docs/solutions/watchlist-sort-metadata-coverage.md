# Watchlist sorting: metadata loss and runtime coverage

Runtime sorting was removed in plan 0092. Unknown durations made it silently
fall back to title order on Letterboxd lists, and a few cached durations could
not establish a useful ordering for the rest. Alphabetical sorting is explicit
instead. Runtime metadata and full-series estimates remain for display; the
cache-observer regression still protects metadata updates without extra reads.
The notes below record why runtime coverage cannot support a shared sort.

The watchlist merge selected a whole provider item by precedence. A Simkl or
AniList winner without runtime/year could discard valid values already fetched
from its Trakt twin. `computeWatchlist` now backfills only valid missing
runtime/year values, cloning the selected item rather than mutating cached data.
Provider identity, external IDs, progress and source-specific state do not merge.
Runtime backfill requires compatible film-versus-episode units and excludes manga.

Sorting adds no metadata reads. Trakt's existing full watchlist response and
AniList's existing shared list selection include runtime/year. Simkl's verified
watchlist summaries and Letterboxd's watchlist/list grids include year, not
runtime. Serializd's verified custom-list entries expose neither runtime nor year.
Those gaps stay unknown; no detail-fetch fan or forced pagination fills them.

Custom lists must not sort only their raw grid records: that made every runtime
unknown and produced alphabetical order even after opening a film's details.
The list screen now owns the progress read that its header already used, and
sorts the resolved items from that same result. Cached film durations are also
observed without a connected tracker; disabled reads keep their real cache keys.
The regression uses A Wind Named Amnesia (80 min) and Baby Love (30 min), changes
the cached duration, and checks order, original progress and zero fetches.

After the original per-episode design, the owner explicitly chose **estimated
full-series runtime**: typical episode duration × the provider's known episode
count, never remaining episodes. This is an estimate, not proof of a finished
series' length; a count may cover only currently known/aired episodes. Films keep
their actual duration. Missing/invalid counts or durations and manga sort last.
The estimate is presentation-only; normalized runtime remains a per-episode
duration for series. See plan 0085 for scope and the preference/reset semantics.
