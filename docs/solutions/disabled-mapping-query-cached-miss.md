# Disabled mapping queries still expose cached misses

A disabled TanStack Query observer can return a cached `null`. The ani.zip
lookup is shared by detail reads and log enrichment, so a live-action movie's
log can cache a miss before its detail screen mounts.

A dependent title lookup must check the item's eligibility as well as the
upstream miss. Otherwise `mapped.data === null` starts an AniList search for a
live-action item and delays its discussion fallback. `useAniListIdByTmdbQuery`
uses the same TMDB-id, missing-AniList-id, and Animation-genre guard on both
queries. Its regression in `src/state/queries/mapping.test.ts` seeds the cached
miss and verifies that the fallback stays idle.
