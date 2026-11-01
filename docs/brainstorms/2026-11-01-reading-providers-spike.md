# Reading providers spike (2026-11-01)

API feasibility spike for issue #209: which services can be a reading
provider, and what manga still lacks. Decisions are extracted into
`docs/plans/0115-reading-domain.md`; this file keeps the evidence.

The 2026-07-04 brainstorm (`2026-07-04-future-domains-and-no-backend.md`)
named Goodreads as dead and Hardcover as the candidate. Both claims were
re-checked rather than carried forward.

## How this was checked, and what it couldn't check

- **Hardcover:** its documentation source,
  `github.com/hardcoverapp/hardcover-docs` at `63fcedf` (2026-10-31): the API
  getting-started page, the OAuth overview, the SPA and native/device guides,
  the actions and scopes table, the user-books schema, and the progress
  guides.
- **Metron:** its server source, `github.com/Metron-Project/metron` at
  `7c4b5c8` (2026-10-26): REST settings, authentication, the scrobble view, the
  nginx config and the Anubis bot policy.
- **Everything else:** web search. Those rows cite third-party sources and are
  weaker evidence.
- **No live probes.** This session's egress policy refused every provider host
  (`api.hardcover.app`, `graphql.anilist.co`, `openlibrary.org`,
  `api.myanimelist.net`, `kitsu.app`, `api.mangaupdates.com`, `metron.cloud`,
  `comicvine.gamespot.com`) except `www.googleapis.com`. The Web column below
  comes from documentation or server source, not a browser-origin request.
  AGENTS.md requires a probe before building a web read path, so each
  provider's first unit starts with one and records it in
  `docs/solutions/web-cors-<provider>.md`.

## Verdict

| Service | Domain | Auth | Read | Write | Web | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **Hardcover** | books; comics (issues, trades) and manga/light-novel volumes as books | OAuth 2.0 code + PKCE, public client | library by status, reads with page progress, journal | status, progress, dates, lists | docs: "CORS is open"; probe pending | **Book provider** |
| Goodreads | books | none; no new keys since Dec 2020 | public shelf RSS, last 100 per shelf | none | RSS CORS unknown | Not a provider |
| StoryGraph | books | none (API on roadmap since 2021) | scraping only | none | — | Not viable |
| Open Library | books + reading log | cookie session only | public reading log JSON | undocumented cookie posts | GET likely open | Metadata at most |
| Google Books "My Library" | books | Google OAuth (`auth/books`) | shelves (2 to read, 3 reading now, 4 have read) | add/remove volume | **probed: preflight echoes origin, allows POST** | Viable, low value |
| Literal.club | books | email/password → token | reading states | reading states | unknown | 2026 status unknown |
| **Metron** | comics (issues) | Knox bearer token from the account page (Basic auth deprecated) | collection with read dates, pull list | `POST /api/collection/scrobble/` | no CORS in server config | **Comics candidate**, native-only on web |
| League of Comic Geeks | comics | session cookie (unofficial scrapers) | scrape | scrape | — | Not viable |
| Comic Vine | comics metadata | API key | metadata only | none | no CORS (JSONP) | Not a tracker |
| CLZ Comics | comics collection | none | none | none | — | Not viable |
| **AniList** (connected) | anime + manga (+ light novels as `NOVEL` format) | implicit grant (web), code (native) | lists, activity | `SaveMediaListEntry` | open (`web-cors-anilist.md`) | **Manga provider** |
| MyAnimeList | anime + manga | OAuth2 PKCE (plain) | lists | `my_list_status` (chapters, volumes) | community reports no CORS | Optional later, native-only on web |
| MangaUpdates | manga | username/password → session JWT | lists | `/v1/lists/series` | CORS error reported | Not recommended (single session) |
| MangaDex | manga reader | personal clients only | follows, reading status | status | — | Not viable for a distributed app |
| Kitsu | anime + manga | OAuth password grant | library entries | library entries | — | Availability doubtful in 2026 |

## Hardcover

The 2026-07 note assumed a pasted personal token and a browser ban. Both are
out of date.

- **OAuth is real** (`api/OAuth.mdx`): authorization code with PKCE `S256`,
  required for every client, and no implicit grant. App types are fixed at
  registration: confidential (server), single-page app (public, no secret),
  and "mobile, desktop, or CLI" (public, no secret, custom URI schemes, device
  grant). A bundled public client id is the documented model, like Simkl's.
- **Endpoints:** authorize `https://hardcover.app/oauth2/authorize`; token,
  revoke and device under `https://api.hardcover.app/oauth2/*`; discovery at
  `https://api.hardcover.app/.well-known/oauth-authorization-server`. Callbacks
  carry `iss`, which must equal `https://api.hardcover.app` (RFC 9207).
- **Tokens:** opaque. Access `hc_at_…` lasts one week. Refresh `hc_rt_…` lasts
  six months and **rotates on every use**; replaying a spent one revokes the
  whole chain, so the user must reconnect. Refresh must be single-flight within
  a process and across web tabs. Consent persists a year, and sign-out should
  revoke because Hardcover lists sessions per app.
- **Browser use:** "CORS is open, so requests from a web browser will work." A
  stale Limitations bullet still says queries may not run in the browser. It
  predates OAuth and concerns keeping a personal token secret; the SPA guide
  exchanges the code and calls the API from the page. The live probe settles
  both the GraphQL endpoint and the token endpoint, which AniList blocks.
- **Scopes:** `read:me`, `read:library` (`user_books`, `user_book_reads`),
  `write:library` (insert, update and delete for both), `read:catalog:search`
  (`search`, `books`, `editions`), `read:journal` (diary), and
  `read:lists`/`write:lists`.
- **Model:** a library entry (`user_books`) has `status_id` 1 Want to Read,
  2 Currently Reading, 3 Read, 4 Paused, 5 Did Not Finish, 6 Ignored. Each
  read-through is a `user_book_reads` row with `progress_pages` (or
  `progress_seconds` for audio), `started_at` and `finished_at`. Setting status
  2 starts a read and status 3 finishes it. Progress that reaches the edition's
  page count finishes the read. The server writes journal entries for
  starting, progress and finishing, so a client must not write them too.
- **Writes:** `insert_user_book`, `update_user_book(id, object: {status_id})`,
  `update_user_book_read(id, object: {progress_pages, action_at})` and
  `insert_user_book_read` for past reads with precision 1 day, 2 month or
  3 year.
- **Limits:** free plan 5,000 requests a day, burst 10, 60 a minute, per
  token. Each **top-level field** costs one, aliases count separately, and
  nested selections are free. A request with more top-level fields than the
  burst limit is rejected with `403 request_exceeds_capacity`. `RateLimit` and
  `RateLimit-Policy` headers report the budget. Queries time out at 30 s,
  search at 2 s, and `_like`/`_regex` filters are disabled.
- **Search:** `search(query, query_type: "book", per_page, page)` returns
  Typesense hits. `book_mappings` maps other services' ids (Goodreads, Open
  Library) to Hardcover books.
- **Links:** `https://hardcover.app/id/book/{id}` 302s to the current slug.
  That is the `providerItemUrl` shape no-dead-end links need.
- **Terms:** commercial or public sites may not use member data except on
  behalf of the member who authorized it, which is Shinobu's model. The docs
  ask public sites that show Hardcover images to publish a DMCA takedown
  policy. The API is beta: tokens may be reset and shapes may change.
- **Coverage:** books, plus comics catalogued as `{Series} #{n}` issues,
  `{Series}, Vol. {n}` trades and omnibuses, and manga and light novels as
  `{Series} (Manga), Vol. {n}` volumes, all in the "Graphic Novel" or "Light
  Novel" category. Hardcover can track comics and manga **volumes**. It does
  not track manga **chapters**.

## Goodreads

No public API since December 2020, no new keys, and no announced revival. The
only machine-readable surface left is the per-shelf RSS
(`/review/list_rss/{userId}?shelf=read`). It needs a public profile, returns
only the last 100 additions per shelf, and has no write path. Scraping signed-in
pages would need a fourth Worker proxy on web, which AGENTS.md rules out. The
useful path for a Goodreads reader is Hardcover's Goodreads import followed by
connecting Hardcover. A read-only RSS leg could come later; it would be
native-only on web unless the feed sends CORS headers.

## Comics

- **Metron** (`metron.cloud`): an open comics database with user collections,
  read dates, a pull list and reading lists. Since January 2026,
  `POST /api/collection/scrobble/` with `issue_id`, optional `date_read` and
  optional `rating` (1–5) marks an issue read. Scrobbling an issue that isn't
  in the collection adds it as a quantity-1 **digital** copy, which a
  non-collector may not expect. Auth is a Knox bearer token from the account
  page (`TOKEN_TTL: None`, revoked by the user); Basic auth is being removed.
  Throttles are 20 a minute and 5,000 a day. Neither `django-cors-headers` nor
  nginx adds CORS headers, so web is expected to be native-only. The operator
  denies misbehaving clients by User-Agent in an Anubis policy (22 rules), so a
  client must back off on 429 and identify itself on native.
- **League of Comic Geeks:** no API. Community libraries scrape signed-in
  pages with session cookies, so this would mean a Letterboxd-style WebView
  integration on native and nothing on web.
- **Comic Vine, CLZ, Marvel:** metadata or collection tools with no user
  tracking API.

The owner remembers an account on a comics service; League of Comic Geeks is
the likeliest. If so, the realistic options are Hardcover's comics coverage or
Metron.

## Manga

AniList stays the manga provider. Gaps in the current integration:

1. **No chapter log.** `LogMediaButton` returns `null` for `MANGA`, which is
   neither film-like, an anime series nor TV, so manga can't be logged from
   details or the card sheet. Plan 0024 deferred it. The AniList adapter
   already accepts chapter progress through `entryEpisodes`.
2. **No completion.** `getEntryState` selects only `Media.episodes`, which is
   null for every manga (the total lives in `chapters`), so `logToAniList`
   never sees a total and a manga that reaches its last chapter stays
   `CURRENT`.
3. **No reading rail.** Plan 0011 left manga out of the feed. The only manga
   list read is `getAniListLibrary`, the all-status library the watched marks
   use.
4. **Want-to-read can't be read back.** The watchlist leg selects the
   `type: ANIME` list, so a manga added as `PLANNING` never shows up (plan
   0031 OQ-4) and `hasWatchlistReadLeg` reports no evidence for it.
5. **The diary hides manga** behind All (plan 0095).
6. **Light novels** are `type: MANGA, format: NOVEL` on AniList, so they reach
   the app as manga and count chapters.

## Progress units

| Domain | Provider | Item | Unit | "Done" |
| --- | --- | --- | --- | --- |
| Manga | AniList | series entry | chapter (`progress`); volumes separate (`progressVolumes`) | `COMPLETED` at `chapters` when known |
| Book | Hardcover | book; edition supplies `pages` | page (`progress_pages`), or seconds for audio | status 3, or progress reaching the edition's pages |
| Comic issue | Metron or Hardcover | issue | none: read or unread | scrobbled / status 3 |
| Comic or manga volume | Hardcover | book | page | status 3 |

A chapter, a page and a volume are never converted into one another. A
Hardcover manga volume and an AniList manga series are different items and
never merge.

## Open questions for the owner

- Which comics service was the old account on?
- Is Google Books worth anything as a second book provider? It is the only
  one confirmed CORS-open from this session.
- Should a Goodreads read-only RSS leg exist at all, given the
  import-to-Hardcover path?
