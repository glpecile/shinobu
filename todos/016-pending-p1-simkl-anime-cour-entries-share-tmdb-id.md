---
status: pending
priority: P1
---

# Simkl cour-split anime entries share one TMDB id and mis-merge per episode

Owner report 2026-09-16: the episode screen for *Saga of Tanya the Evil* S2E11
read "Logged on Simkl" with a Rewatch button while Simkl's own page showed the
episode unwatched.

## Cause (verified against Simkl's public catalog and API docs)

- Simkl files each broadcast cour as its own anime entry, and every cour carries
  the parent show's ids: *Youjo Senki* (555226), *Youjo Senki II* (1670325) and
  a 2021 ONA all state `tmdb: 69346`. Episodes in each entry start at 1.
- The original `findLibraryEntry` (`state/queries/simkl.ts`) accepted a Simkl id
  *or* a TMDB id per entry, so season 1 could win on TMDB id before the loop
  reached season 2's exact Simkl id. The current code disables TMDB fallback
  for non-film anime. This prevents that particular cross-cour false positive,
  but an item without a Simkl id now cannot resolve a cour through TMDB at all.
- The season 1 entry is `completed`; Simkl sends no `seasons[]` for those
  (`docs/solutions/simkl-completed-shows-have-no-episode-detail.md`), and both
  `use-episode-logs.ts` and the seasons accordion read an empty key set on a
  completed entry as "every aired episode" — for the *whole* TMDB layout.
- Even the right entry keys wrong: its per-entry episodes 1..n land as
  `"1-n"` against TMDB's season 2.

## Remaining fix (checked 2026-09-27)

1. Preserve the non-film anime TMDB guard until a cour-safe lookup exists. For
   films and ordinary shows, prefer an exact Simkl id across the bucket before
   falling back to TMDB, rather than checking both on each entry.
2. Read anime with `extended=full_anime_seasons`: entries gain
   `mapped_tvdb_seasons` and each episode a `tvdb { season, episode }` block.
   Key anime `watchedEpisodes` by those coordinates and fold every anime entry
   sharing the TMDB id into one view for a TMDB-shaped show.
3. Scope the completed rule to the entry's `mapped_tvdb_seasons`, so a finished
   season 1 entry never vouches for season 2.

Spike first: whether `extended=full` and `full_anime_seasons` combine on one
`/sync/all-items` read, or the anime bucket needs its own request. The current
read asks for `extended=full` only (`lib/providers/simkl/reads.ts`), the
normalizer has no mapped-season fields, and both `use-episode-logs.ts` and
`seasons-section.tsx` still infer every aired episode from an empty completed
entry. Verify the owner-reported S2E11 state after the mapping lands; the
original lookup failure alone no longer describes the current behavior.
