# Details query performance

Keep the TMDB-first metadata query, the per-section Suspense boundaries, and
the provider fallbacks. The anime metadata chain (ani.zip, TMDB `/find`,
catalogue) stays sequential because each leg needs the previous one's id.

- Prefetch on press everything the screen suspends on, not just metadata:
  show seasons from the same source the screen picks, and the AniList
  relations query that also carries episodes, recommendations, tags, score,
  and manga credits.
- Key film plays on the ids their fetch reads. The catalogue merge adds an
  IMDb id once TMDB answers, which refetched every play.
- Look up anime Wikidata ratings by MAL/AniList id first. The entry is one
  cour, and the TMDB id arrives only with the catalogue, re-keying the lookup.
- Pull-to-refresh refetches this item's queries instead of whole provider
  roots, which also reloaded every Home query mounted under the stack.

JS-only; hot reloads. No measured device latency claim is intended.
