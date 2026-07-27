# ani.zip's seasons are TVDB's, and the trackers' usually aren't

**Found 2026-07-27**, logging "The 100 Girlfriends Who Really, Really, Really,
Really, REALLY Love You Season 3" episode 4 from the AniList details screen.
Trakt answered `Trakt matched no items … (not_found)` and Serializd answered
`Serializd has no season 3 for this show yet`.

## What happened

Plan 0027 translates an AniList entry's own episode numbers into canonical
`{season, number}` pairs using ani.zip's per-episode table, then writes those to
Trakt and Serializd. For this show ani.zip says entry episode 4 is **S03E04**.

Both trackers model the show as **one season of 28 episodes**. There is no
season 3 to write to — so Trakt 404s and Serializd can't resolve a `seasonId`.
The episode the trackers *do* have is **S01E28**, which is exactly ani.zip's
`absoluteEpisodeNumber` for that row.

The cause is a source mismatch the original plan under-weighted: ani.zip's
`seasonNumber`/`episodeNumber` are **TVDB-derived**, and TVDB splits anime into
broadcast seasons that Trakt and TMDB frequently don't have.

## The probe (six entries, both trackers, 2026-07-27)

| AniList entry | ani.zip (TVDB) | Trakt layout | TMDB layout | Resolvable write |
| --- | --- | --- | --- | --- |
| 100 Girlfriends S3 (200637) | S3E1, abs 25 | `S1:28` | `S1:29` | **absolute** |
| Dan Da Dan S2 (185660) | S2E1, abs 13 | `S1:24` | `S1:24` | **absolute** |
| Solo Leveling S2 (176496) | S2E1, abs 13 | `S0:1 S1:25` | `S0:1 S1:25` | **absolute** |
| Mushoku Tensei S2 pt2 (166873) | S2E13, abs 38 | `S0:3 S1:23 S2:24 S3:5` | same | **TVDB pair** |
| Gachiakuta (178025) | S1E1, abs 1 | `S1:24` | `S1:24` | either |
| Frieren (154587) | S1E1, abs 1 | `S0:26 S1:38` | same | either |

Two findings drive the fix:

1. **Half the sample diverges**, and it's specifically the sequel-season
   entries — the exact case plan 0027 exists to serve. Plan 0027 KTD6's *"for
   anime these overwhelmingly agree"* was written about TVDB-vs-TMDB; the real
   split is **TVDB vs both trackers**, and it is not rare.
2. **Trakt and TMDB agree with each other on all six.** So one season layout
   resolves both write targets, and translation stays a single centralized step
   (KTD2 survives).

Note the third row: where a tracker *does* split by season it splits the way
TVDB does, and there the TVDB pair is right while absolute counting is wrong
(Mushoku Tensei S2 part 2 → S02E13; counting absolutely lands on S02E15,
because TVDB's absolute numbering and TMDB's per-season counts don't line up).
Neither axis wins outright — which is why the fix consults the destination.

## The fix

`lib/providers/mapping/season-layout.ts`'s `placeInLayout` puts an ani.zip row
into the **destination's own** numbering, given that show's season/episode-count
skeleton:

1. The destination has ani.zip's season **and** it holds enough episodes → use
   `{seasonNumber, episodeNumber}`.
2. Otherwise walk the destination's non-special seasons by
   `absoluteEpisodeNumber` and use the season it lands in.
3. Neither → reasoned skip with a manual link. Never a raw TVDB write.

The layout comes from `cachedSeasonLayout` (`state/queries/mapping.ts`): TMDB
`/tv/{id}` first — no user session needed, and Serializd's season ids *are*
TMDB's seasons — falling back to Trakt `/shows/{id}/seasons?extended=full`
(a public catalogue call) when there's no TMDB token. Cached on the same ~1 h
window as the episode map, because an airing season gains episodes.

Two details worth keeping:

- **Season 0 is excluded from absolute counting.** Solo Leveling's single
  special would otherwise shift every episode by one (S01E13 → S01E12).
- **`episode_count`, not `aired_episodes`.** This is a question about the
  show's structure, so an episode that aired an hour ago must still place.

Verified live against all six entries above, each producing the expected write.

## Watch for

A show where Trakt and TMDB *disagree* with each other would break the
single-layout assumption — the fan-out would then write the right episode to
one provider and the wrong one to the other. Nothing in the sample did, but if
it turns up, the fix is to resolve the layout per write target rather than
once. Record the instance here first.
