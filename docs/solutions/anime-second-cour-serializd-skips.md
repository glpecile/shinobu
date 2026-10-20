# Second-cour anime skipped Serializd

**Symptom (2026-10-20).** Two AniList-origin anime would not log to Serializd:

- *Koori no Jouheki 2nd Season* (AniList 213805): "ani.zip has no episode
  mapping for this entry yet".
- *Cyberpunk: Edgerunners 2* (AniList 195539): "couldn't read this show's
  season list to place the episode".

## Causes

**ani.zip hadn't mapped the second cour.** 213805 has an empty `episodes`
block and no TVDB, TMDB or AniDB ids. TMDB keeps the show as one 28-episode
season (283428), and the first cour (186497) maps cleanly onto episodes 1–14.

**ani.zip's TMDB id for a sequel can be wrong.** 195539's `themoviedb_id` is
326788, which is a 404 as both TV and movie on TMDB. Its `thetvdb_id` (384541)
finds the real show, 105248 (S1 10 + S2 10) through `/find`. The details read
already took the TVDB route (`state/queries/media-details.ts`). The log's
`enrich.ts` took ani.zip's TMDB id, so the season layout came back null.

## Fix

- `enrich.ts` resolves a series anime's TMDB id through TVDB `/find` and falls
  back to ani.zip's id only when that misses.
- `resolveLogPlan` (`use-log-media.ts`) falls back to the prequel when the
  entry has no ani.zip rows. AniList names a single TV/ONA `PREQUEL` with a
  known episode count, and `continuePrequelTable` continues that prequel's
  table when it is gap-free and reaches its final episode. Every row still goes
  through `placeInLayout`, so a continuation that doesn't fit the tracker's
  seasons still skips with a reason.

AniList's `PREQUEL` relation does not prove a shared tracker show. Naruto and
Shippuden, for example, have separate TVDB/TMDB identities. A failed episode-map
read must not borrow Naruto's numbering for Shippuden. The fallback therefore
requires the same TVDB id, or a prequel TVDB-to-TMDB lookup matching the target
show when the target has no TVDB id. An unresolved or different identity skips.

Borrowed rows stay within the prequel's season and carry no invented absolute
number. Mushoku Tensei's prequel 166873 ends at S2E24, absolute 49, while sequel
178789 starts at S3E1, absolute 50. Projecting absolute 50 into TMDB's differently
sized seasons would write S3E3. Without the sequel's own table, that transition
must skip instead.
