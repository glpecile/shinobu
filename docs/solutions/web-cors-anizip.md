# Web CORS: ani.zip mappings API — open to browsers, use directly

**Verified 2026-07-14** via `curl` with `Origin: http://localhost:8081`.

ani.zip (`https://api.ani.zip/mappings`) is the API face of the community
anime-lists dataset. Shinobu uses it to bridge AniList ↔ Trakt identities for
the anime log fan-out (plan 0011 decision 5): AniList ids on one side,
TMDB/TVDB/IMDB ids (which Trakt can resolve via `/search/{id_type}/{id}`) on
the other.

## Findings

- **CORS: PASS.** `GET https://api.ani.zip/mappings?anilist_id=21` with a
  browser origin returns `access-control-allow-origin: *` and
  `access-control-allow-methods: *` — usable directly from the web app, no
  proxy, no native-only restriction.
- **Lookups work in both directions**: `?anilist_id=`, `?thetvdb_id=`, and
  `?themoviedb_id=` all return the same document.
- The `mappings` block carries `anilist_id`, `mal_id`, `thetvdb_id`,
  `themoviedb_id` (string!), `imdb_id`, and `type` (`"TV"` / `"MOVIE"`).
  Movies have `thetvdb_id: null` and rely on `themoviedb_id`/`imdb_id`.
- The `episodes` block keys **AniList-entry-relative episode numbers** to TVDB
  season/episode numbers (`seasonNumber`, `episodeNumber`, plus
  `absoluteEpisodeNumber` as a separate field). *Corrected 2026-07-27:* the
  original note called the keys "absolute episode numbers" — they are not.
  Live probes of two titles show the keys start at `"1"` for every entry, so a
  sequel entry's `"1"` carries `{seasonNumber: 2, episodeNumber: 1,
  absoluteEpisodeNumber: 13}` (Dan Da Dan S2, anilist 185660) and a split-cour
  entry's `"1"` carries `{seasonNumber: 2, episodeNumber: 13}` (Mushoku Tensei
  S2 part 2, anilist 166873). A first-season entry maps to itself (Gachiakuta,
  anilist 178025). `"S1"`-style keys are AniDB specials and carry no season
  numbers at all.
- Responses are cacheable (`cache-control: public, max-age=900`) and can be
  **large** (One Piece ≈ 1 MB because of the episode table) — decode only the
  `mappings` block for identity lookups, and cache with
  `staleTime: Infinity` (mappings don't churn).

## The episode table is now consumed — on write actions only (plan 0027)

The season-mapping fix (`docs/plans/0027-anime-season-mapping.md`) turns the
`episodes` block into the log fan-out's numbering bridge: an AniList-origin log
arrives entry-relative and is translated to a canonical `{season, number}`
before Trakt/Serializd ever see it. Two constraints keep the 1 MB payload from
becoming a feed-path cost:

- **Separate decoder, separate query.** `fetchAniZipEpisodeMap`
  (`lib/providers/mapping/anizip.ts`) sits beside `fetchAniZipIds` rather than
  widening it, so the identity lookup every feed path makes still retains only
  `mappings`. The write path may re-download a document the ids lookup already
  fetched — a one-time-per-title duplication, deliberately preferred over
  widening the feed-path decode. Only `{season, number}` survives the decode.
- **Action paths only, ~1 h flat cache.** `cachedAniZipEpisodeMap`
  (`state/queries/mapping.ts`, key `['mapping', 'anizip-episodes', anilistId]`)
  caches hits *and* misses under one flat `staleTime`/`gcTime` of an hour —
  short precisely because this is the one ani.zip read whose content changes:
  a just-aired episode lands in the dataset hours late, and a forever-cached
  miss would skip Trakt/Serializd for the rest of the session. The single
  sanctioned render-path consumer is the anime details accordion's header query
  (`useAniZipEpisodeMapQuery`), which shares the cache entry and doubles as the
  pre-warm for a log started from that screen. Never mount it on a list row.

A miss (no document, empty/gapped/multi-season table, or an episode more than
two past the table's end) is an honest skip with a reason, never a guessed
season — see `lib/providers/mapping/episode-translation.ts`.

## Probes

```sh
curl -si "https://api.ani.zip/mappings?anilist_id=21" \
  -H "Origin: http://localhost:8081" | head -8
# → 200, access-control-allow-origin: *

curl -s "https://api.ani.zip/mappings?anilist_id=199" | jq .mappings
# → { "anilist_id": 199, "themoviedb_id": "129", "imdb_id": "tt0245429",
#     "thetvdb_id": null, "type": "MOVIE", ... }

curl -s "https://api.ani.zip/mappings?thetvdb_id=81797" | jq .mappings.anilist_id
# → 21 (reverse lookup)

# Entry-relative episode keys (2026-07-26/27) — a sequel season:
curl -s "https://api.ani.zip/mappings?anilist_id=185660" \
  | jq '.episodes["1"] | {seasonNumber, episodeNumber, absoluteEpisodeNumber}'
# → { "seasonNumber": 2, "episodeNumber": 1, "absoluteEpisodeNumber": 13 }

# …a split cour (the entry's own episode 1 is the season's thirteenth):
curl -s "https://api.ani.zip/mappings?anilist_id=166873" \
  | jq '.episodes["1"] | {seasonNumber, episodeNumber}'
# → { "seasonNumber": 2, "episodeNumber": 13 }

# …and a first season, which maps to itself:
curl -s "https://api.ani.zip/mappings?anilist_id=178025" \
  | jq '.episodes["1"] | {seasonNumber, episodeNumber}'
# → { "seasonNumber": 1, "episodeNumber": 1 }
```
