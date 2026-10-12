# Watched indicators on provider lists

## Extended scope

- Enable the shared series-level eye on Serializd list rows, matching TV history
  in Simkl/Trakt as on person/studio pages.
- Include Serializd-only history in the shared mark through one account-keyed
  watched-show snapshot. Read `watchedpage_v2` sequentially through all reported
  pages; the retired per-show `/progress` endpoint cannot answer this.
- Normalize records at the provider boundary, contain failed reads to the mark,
  and invalidate the snapshot after successful Serializd logs. The eye means
  series watch history, not completion of a specific season or episode.
- Simkl custom-list browsing remains deferred; its TV library already supplies
  watched state to the shared indicator.
- Add the existing centered list icon to the shared empty list index.

- Extract the person/studio timeline's watched eye into a shared component.
- Opt Letterboxd list grid and row layouts into that indicator; leave watchlists
  and the anime explorer unchanged.
- Resolve slug-only films with `useLetterboxdFilmQuery`, the same public film-page
  identity read used by details. Do not repeat the title-only mapping reverted in
  `docs/solutions/letterboxd-list-watched-indicator.md`.
- Resolve only mounted cells, share the existing query cache, and skip identity
  requests without a connected watched-state provider. Failed reads leave artwork
  and navigation usable without asserting watched state.
- Reuse Trakt/Simkl watched snapshots and their log invalidations. Preserve typed
  movie identity; a Letterboxd TV relationship is not a movie watch match.
- Validate identity handling, lint, types, and repository checks. JS-only: hot
  reload, no native rebuild.

## Validation

- All 1,376 tests pass; typecheck, lint, class-name/navigation/link checks and
  the production web export pass.
- The public `/film/vampire-hunter-d/` page exposes `data-tmdb-type="movie"`
  and `data-tmdb-id="9463"` on its body: the exact identity path resolves the
  film from the earlier failed attempt without a title search.
- Serializd's public watched-page envelope was verified live; new tests cover
  pagination, missing/unsafe accounts, empty libraries and failed later pages.
- Signed-in visual validation remains outstanding; this worktree session has
  no device/browser control tools.
