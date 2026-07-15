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
- The `episodes` block maps **absolute episode numbers to TVDB
  season/episode numbers** per episode (`seasonNumber`, `episodeNumber`,
  `absoluteEpisodeNumber`) — the future path for multi-season anime logging.
- Responses are cacheable (`cache-control: public, max-age=900`) and can be
  **large** (One Piece ≈ 1 MB because of the episode table) — decode only the
  `mappings` block for identity lookups, and cache with
  `staleTime: Infinity` (mappings don't churn).

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
```
