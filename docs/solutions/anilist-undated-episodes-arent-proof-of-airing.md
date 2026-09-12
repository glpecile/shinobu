# "Log episode 1" on an anime whose every episode says Unaired

## Symptom

(owner, 2026-09-12.) *Cyberpunk: Edgerunners 2*, 0 of 10 episodes, nothing
aired: the details CTA offered **Log episode 1** — enabled — directly above a
seasons accordion that marked all ten episodes *Unaired*. Two surfaces on one
screen, opposite answers, from the same episode list.

## Cause

`getAnimeEpisodes` builds a row per episode from `Media.episodes` (the count),
filling `firstAired` only for the episodes AniList has published an
`airingSchedule` for. An announced season therefore comes back as a *full*
list with **no dates at all** — ten rows, ten absent `firstAired`.

The accordion reads that strictly (`hasAired(undefined) === false` → Unaired).
`log-media-button.tsx` read it permissively: "episode in schedule but no air
date → aired", the catalogue-gap rule. That rule is right for a *gap* — an
episode inside an airing season whose individual date AniList never
published — and a lie for a season that hasn't started, where every row is a
gap.

## Fix

`hasStartedAiring` (`features/log-media/release-gate.ts`) qualifies the
permissive rule with evidence, either kind sufficient:

- **an episode has aired** — the season is running, so an undated sibling is a
  real gap; or
- **the show itself is out** — `filmReleaseStatus` on the item's
  `releaseDate`/`year`, which is what keeps the back catalogue loggable:
  AniList retains no schedule for a 2005 series, so nothing there is dated.

Neither present → not aired, so the CTA disables and says so, which is the
answer the accordion was already giving. Deliberately strict at one edge: a
season airing *this year* that AniList has published no schedule for reads as
not started.

## Rule

An absent provider field is not a fact about the world. Before reading one
permissively ("no date, assume it happened"), find the evidence that makes the
assumption safe — and check what the *other* surfaces on the screen conclude
from the same payload, because a disagreement between two of them is the bug
the user will report.
