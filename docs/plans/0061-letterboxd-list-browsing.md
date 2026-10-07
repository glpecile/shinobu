# Letterboxd list browsing

## Scope

Read-only browsing of the connected member's public created and liked lists.
Home places separate Letterboxd-marked **Your Lists** and **Liked Lists** rails
immediately below the watchlist rows. Each card shows a poster preview, title,
creator and film count. View all paginates the list index; tapping a list opens
its films in Shinobu and tapping a film opens existing media details/actions.

No list editing, liking, private-list access, or speculative provider adapters.

## Implementation

- Scrape public list-summary articles; reuse the watchlist LazyPoster parser
  and film normalizer. Scope film parsing to the actual grid, not sidebar art.
- Fetch liked lists through `/likes/lists/page/1/`, not the challenged bare URL.
  Use pagination links as the next-page signal, never inferred page sizes.
- TanStack suspense infinite queries own both rails and full browsing, keyed
  by member/kind or list owner/slug. Refresh home indices with other sections.
- Resolve list films from their cached pages without fetching lists on details.
- Widen the existing GET-only Worker allowlist to exact public list index and
  list film paths, with bounded usernames, slugs and page numbers. Preserve
  unauthenticated requests, CSP, no cookies, timeouts and traversal rejection.
- Reuse collapsible sections, virtualized rails, poster wall, skeletons and
  card actions. Keep failed home rows isolated; browsing errors offer retry,
  Back and a link to the same page on Letterboxd.

## Validation

Fixture tests for summary parsing, scoped film parsing, pagination and failures;
extend the proxy allowlist tests. Run repository checks and tests. Validate on
the running Pixel 9 Android emulator: both home rails, View all, list films,
film details and Back. Fall back to iOS/web only if Android is blocked.

Transport findings: `docs/solutions/letterboxd-public-list-pages.md`.

### Results (2026-10-06)

- Typecheck, lint, class-name/navigation/link checks and 1,264 tests pass.
- Android's existing development client crashes at startup with
  `App react context shouldn't be created before.` Validation fell back to
  the running iPhone 17 Pro simulator; no native changes were made.
- iOS recorded paths replay successfully: empty created/liked indices;
  populated Home rails, created-list View all, list films, film details and
  Back; liked-list View all, films and Back. Light and dark render correctly.
- The connected `glptest` account has no lists. Populated validation used
  temporary QueryClient data fetched from public member `jack`, without
  changing any session or upstream list. Original cache and system theme were
  restored afterward.
- Native reads loaded 24 summaries across two pages for both indices. An
  injected next-page failure retained loaded lists and showed the retry footer;
  retry settled successfully without discarding the first page.
- Some upstream poster CDN URLs return 403, including in existing watchlist
  and detail paths; see the transport findings above.

JS-only changes hot reload; no clean native rebuild is required. Web needs
the updated existing Worker alongside the app.
