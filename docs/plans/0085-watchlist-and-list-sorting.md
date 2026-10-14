# Watchlist and list sorting — #226

## Scope and implementation

1. Add one immutable sorter for entries with an `id` and normalized `item`.
   Runtime ascending/descending and release year descending/ascending put invalid
   or absent values last, then break ties by title and entry id. Per the owner's
   follow-up, runtime is film duration for MOVIE/anime films and **estimated full
   series duration** (typical episode duration × known episode count) for series.
   Missing/invalid counts and manga are unknown. Never subtract watched progress.
   Default leaves input order unchanged (Recently added on watchlist, List order
   on custom lists, whose curated ranks must not be called add-times).
2. Persist watchlist and custom-list sort separately in the existing preferences
   MMKV/localStorage store, with SSR-safe defaults and invalid-value fallback.
3. Reuse the native picker/web picker sheet in one shared sort control. The owner
   requested tracker/sort pills together in a fading horizontal Rail, with the
   layout toggle fixed outside the rail. No explanatory runtime paragraph;
   concise estimated-runtime labels instead. “Sorting loaded titles” carries an
   information icon. Present three compact list-header designs before choosing
   the final list composition.
   The chosen composition reuses MediaToolbar for watchlist and both list
   providers; list progress joins the owner byline. List link/like icons use
   matching neutral pill borders and shared Button sizing, with browser-native
   hover tooltips. Separate retry/provider actions in list errors with a 12px gap.
4. Sort the watchlist after tracker filtering, before either media layout. Apply
   the same helper/control to Letterboxd list poster/row layouts and Serializd
   list entries (retain season/episode identity, subtitles and destinations).
   Preserve existing infinite-scroll paging/retry paths in every sort, per the
   owner's follow-up. No automatic full-library loading to complete a sort.
5. In watchlist merging, backfill only valid year/runtime metadata, keeping
   provider precedence for known values. Runtime fallback requires matching
   film/episode semantics and excludes manga. Do not change IDs, provider facts,
   progress, or cached objects.

## Provider coverage audit

- Trakt: watchlist already requests `extended=full,images`; normalization keeps
  `year` and typical-episode/film `runtime`. Existing pagination is unchanged.
- AniList: shared CURRENT/PLANNING read uses CARD_FIELDS with `duration`,
  `seasonYear`, `startDate.year`, and film format. No selection/request change.
- Simkl: current `/sync/all-items` summary preserves year but exposes no runtime
  in the verified contract. A compatible merged Trakt/AniList copy can supply it.
- Letterboxd: watchlist and custom-list HTML grids share slug/title/year parsing;
  they do not carry duration. Custom-list sorting reuses the film records the
  existing progress read already resolves, including cached duration, without
  starting another read. Cold/unresolved records remain unknown.
- Serializd: verified custom-list item contract carries show/season/episode
  identity and titles/art, but no runtime or release year. These sorts therefore
  fall back to deterministic title/entry order until data is available. No guessed
  payload fields or per-show enrichment. Its incomplete-list external link stays.
- TMDB: no extra metadata requests or cache-wide enrichment for sorting.

Series totals are estimates over the episode count already supplied by the
provider (which may be currently known/aired episodes, not a finished run).
Future/unknown episodes cannot be included without guessing. Anime cours keep
their own provider episode counts. Neither totals nor remaining time are written
back into normalized metadata or provider state.

## Owner-reported follow-ups during implementation

- List sorting was still alphabetical because it received raw grid records.
  Move the existing progress read to the list screen and expose its resolved
  items to sorting; the progress header consumes the same result. This reuses
  existing duration/year/identity reads rather than adding a request fan.
- Show the same full-runtime value in the card-actions metadata line. Series
  totals remain visibly estimated; film minutes are exact provider metadata.
- Add Android's bottom safe-area inset to the list-index scroll content, plus
  breathing room. Leave onEndReached and its short-page rearm threshold alone.
- Do not infer false personal state from a partial liked index or a missing
  member-film viewing. Show unknown like state with the provider escape hatch
  and mark incomplete progress as a lower bound. Exact parity requires a
  separate provider-read capability; see the linked solution note.

## Validation

Read neighboring compute/filter/provider tests before adding small branch tests
for immutable comparison, invalid values, units, deterministic ties, default
restoration, filtering/new pages, and merge fallback in either precedence order.
Run relevant tests, `bun typecheck`, `bun lint`, `bun check:classnames`,
`bun check:router-push`, `bun check:links`, and `git diff --check`.

Use isolated synthetic UI data (no persisted credentials, no live provider
writes) to verify both layouts/directions, filtering, loaded-subset pagination,
preference reload, unknowns, keyboard/accessibility labels, larger text,
light/dark and web. Capture screenshots for the authorized PR. Record which
native checks could actually run. JS/TS only: hot reload, no native rebuild.

The owner subsequently took over visual QA. Stop interactive testing rather than
continuing the visual matrix; report the automated and interactive checks that
actually completed. Temporary fixture routes are removed before shipping.

## Results

- 168 relevant tests across 18 files pass. The cached-duration regression was
  first reproduced against raw grid items (alphabetical order), then passed
  with the shared metadata result, including a changed cached duration and zero
  fetches. Unknown liked-index branches are covered beside the existing mutation
  regression.
- Typecheck, lint, classnames, router-push, external links and diff whitespace
  checks pass. Lint retains five pre-existing warnings in untouched tests.
- Fixture checks completed for both layouts/directions, reset, filtering,
  preference reload, keyboard selection, rail/fixed-toggle behavior and larger
  text before the owner took over visual QA. No further visual testing was done.
  Native final-state and end-to-end pagination sign-off remain with the owner.
- All changes hot reload; no native rebuild, dependencies or generated native
  files. No persisted credentials were inspected and no live provider writes ran.
