# A movie watched on Simkl still offered "Mark as watched"

**Symptom (2026-08-01).** Hokum was logged on Simkl — Simkl's own page showed
"Add Rewatch" and "Watched on May 22, 2026" — while Shinobu's details screen
showed a primary "Mark as watched" button and no watched line at all, on both
web and iOS. Logging again would have written a duplicate play.

**Root cause.** Watched state for a film came from exactly one provider.
`LogMediaButton`'s `isRewatch` was `useTraktWatchedInfo(item) != null ||
anilistStatus === 'COMPLETED' | 'REPEATING'`, and `WatchedLine` used the same
Trakt hook. AniList is anime-only, Letterboxd exposes no readable watch state,
Serializd is TV-only — so for a movie, **Trakt was the only source**, and
post-detachment (plan 0034) most users have no Trakt session at all.

Simkl was already a full movie write target (`registry.ts`: `canRead` *and*
`canWrite`), so Shinobu was writing movie plays to Simkl and reading them back
nowhere. The details screen's one Simkl leg, `useSimklWatchingEntryQuery`, was
structurally unable to help: it is TV-gated at the call site, its matcher
scanned only `shows`/`anime`, and its two snapshots are `watching` and
`plantowatch` — **a watched movie is in neither**. Simkl holds one status per
item and a finished film is `completed`; nothing in the app had ever requested
that filter.

**Fix.**

- `simklCompletedLibraryQuery()` (`state/queries/simkl.ts`) — the `completed`
  `/sync/all-items` snapshot, same 15-minute window and same `allItemsRoot`
  invalidation prefix as its `watching`/`plantowatch` siblings, so a log
  fan-out refreshes it and nothing polls it (the rate-limit discipline in
  `simkl-rate-limits-and-write-lock.md`).
- `useSimklWatchedInfo` selects one film out of it and returns Trakt's
  `{ plays, lastWatchedAt }` shape. `plays` is always ≥ 1: Simkl records only
  the latest play of a movie with no rewatch counter, so the hook proves
  "watched" without claiming a count it doesn't have, and the line reads
  "Watched · 22 May 2026" rather than "Watched 1×".
- `useWatchedInfo` (`state/queries/watched-info.ts`) is the new single
  predicate — Trakt first (it counts real plays), then Simkl. **Both** former
  call sites route through it, so the next surface that asks "is this watched?"
  gets every provider by construction rather than re-picking one.

**Two traps this fix had to avoid.**

1. **Bucket by the item's own type.** `findLibraryEntry` searches
   `movies + anime` for a film and `shows + anime` for a show, never all three:
   TMDB numbers movies and TV in **separate id spaces**, so a flat scan will
   eventually match a movie against a show carrying the same TMDB id. Anime is
   in both lists because Simkl files anime films under its anime catalog, not
   `movies[]` — the same asymmetry `routing.ts` encodes for writes.
2. **Films only, deliberately.** TV keeps `useSimklWatchingEntryQuery`, whose
   per-episode progress line is richer than a play count. A show parked in
   `completed`/`hold`/`dropped` is still the documented degrade in
   `simkl-only-tv-details-trakt-gated.md` — widening it means putting a third
   snapshot behind every TV details screen, which is a separate decision.

**Still open:** the write-side reconcile has the same hole with its own written
rationale — `use-log-media.ts` has no Simkl `providerHasIt` branch, so a Simkl
log is never treated as parity/rewatch (plan 0034 Scope Boundaries). The
`completed` snapshot this fix adds is now a warm cache entry a future reconcile
could consult without a new request.
