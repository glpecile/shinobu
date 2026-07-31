# Serializd: does a watchlist write clear watched state?

**No.** Watched and watchlisted coexist per-season on the live API. The
exclusivity Serializd's own copy claims — *"You can't mark a show / season as
'Watched' and 'Watchlisted' at the same time"* — is a **UI convention, not an
API invariant**.

Plan 0031 U10, discharging KTD-10's named risk and resolving stop-condition (c).
Probed 2026-07-30 against a real connected account (301 watched shows, 27
watchlisted).

> Re-run the check below whenever the Serializd endpoints move (`_v2` → `_v3`)
> or the season-id join stops matching — this finding is dated, not eternal.

## The decisive evidence, and why no destructive write was needed

U10 as written called for marking a season watched, watchlisting it, and seeing
whether the watched flag survived — a deliberately destructive probe on a real
account. That turned out to be unnecessary: the account **already contained the
experiment's outcome**, 14 times over, as ordinary user data.

Intersecting the two account-wide lists — `GET user/{username}/watchedpage_v2/{page}`
and `GET user/{username}/watchlistpage_v2/{page}`, both of which return
`items[].seasonIds` — 14 shows appear in both. In **13 of the 14 the same season
id is in both sets simultaneously**:

```
198178 Wonder Man                       watched [288697]  watchlisted [288697]           overlap [288697]
245640 Hal & Harper                     watched [377769]  watchlisted [377769]           overlap [377769]
262377 Detectives These Days Are Crazy! watched [407642]  watchlisted [407642]           overlap [407642]
126506 Smiling Friends                  watched [235971, 386321, 461112]
                                                          watchlisted [461112]           overlap [461112]
207468 Kaiju No. 8                      watched [303441]  watchlisted [303441]           overlap [303441]
  8654 The SoulTaker                    watched [18546]   watchlisted [18546]            overlap [18546]
228878 Common Side Effects              watched [345532]  watchlisted [345532, 448625]   overlap [345532]
262254 With You and the Rain            watched [407425]  watchlisted [407425]           overlap [407425]
259886 The War Between the Land and Sea watched [403731]  watchlisted [403731]           overlap [403731]
100565 86 EIGHTY-SIX                    watched [145370]  watchlisted [145370]           overlap [145370]
117465 Hell's Paradise                  watched [178239, 347188]
                                                          watchlisted [347188]           overlap [347188]
256317 Countdown                        watched [397367]  watchlisted [397367]           overlap [397367]
284445 Takopi's Original Sin            watched [442702]  watchlisted [442702]           overlap [442702]
239770 Doctor Who                       watched [366207]  watchlisted [435118]           overlap []
```

A season that is watched *and* watchlisted at once cannot exist if the API
enforces exclusivity. Thirteen do. So a `watchlist_v2` POST naming a watched
season does not clear that season's watched state — there is nothing left for
KTD-10's filter to prevent.

That is U10's third documented outcome, verbatim from the plan: *"If neither
destroys anything, keep the filter anyway … and record that the exclusivity is a
UI convention, not an API one."*

**Stop-condition (c) does not fire.** It requires the write to *destroy* watched
state; 13 live counterexamples say it does not. `watchlistWrite` flips to
`'write'` in `src/lib/providers/registry.ts`. Reverting that one token is the
standing rollback (KTD-9).

## The other finding: `/progress` no longer exists

`GET /user/{username}/show/{tmdbId}/progress` — the endpoint KTD-10's guard reads
and the log path's reconcile depends on — **returns 404 for every show**, watched
or not, and is **absent from the API's URL map**. Verified three ways:

1. `GET /user/glp/show/{id}/progress` → 404 for `296286` (watchlisted, unwatched),
   `110837` and `60625` (both watched, with diary entries).
2. Serializd's Django backend runs with `DEBUG = True`, so a 404 renders the full
   URLconf — 251 patterns. Every `watch*` route is there:
   `watched`, `watched_v2`, `watched/remove_v2`, `watchedpage_v2/<page>`,
   `watchlist_v2`, `watchlist/remove_v2`, `watchlist/random`,
   `watchlistpage_v2/<page>`, `compare_watchlist/<username>`. **No `progress`.**
3. No replacement per-show read exists. `show/{id}` and
   `show/{id}/season/{n}/quick_log_details` carry catalogue metadata only (per-season
   `id` + `episodeCount`, which is what U10 step 0 needed — that half is confirmed
   good), no user state. `episode_logs_page_v2` **ignores its `show_id` query
   param** and returns a global cross-show feed.

Watched state is now only readable account-wide, from `watchedpage_v2` — 13 pages
for a 301-show account. That is exactly the per-item membership cost KTD-3
rejected, so the guard is not rebuilt on it.

### What that means for each caller

- **The watchlist guard** (`watchlistSeasons`, `serializd/writes.ts`) treats a
  **404 from `/progress` as "no watched seasons known"** and proceeds with every
  eligible season. It stays fail-closed for 401/429/5xx/transport. This is safe
  *because of the coexistence finding above*: with nothing to destroy, a guard
  with no input costs only the "S1 is already watched" copy, not data. The filter
  itself is kept, per U10's third outcome, and comes back to life on its own if
  the endpoint returns.
- **The log path's reconcile** (`use-log-media.ts`, via `getWatchedEpisodeKeys`)
  already catches and returns `false` ("doesn't have it"), so it degrades safely —
  but it means a Serializd re-log **never skips**. `/episode_log/add` is
  upsert-shaped and harmless; `/show/reviews/add` is not, so re-logging the same
  single episode writes a **duplicate diary entry**. Pre-existing, out of scope
  here, and worth its own fix — see follow-ups.

## Reproducing

The read-only exclusivity check is the decisive one and needs no credentials —
both list endpoints are public for a public profile:

```
GET https://serializd.onrender.com/api/user/{username}/watchedpage_v2/{page}?sort_by=date_added_desc
GET https://serializd.onrender.com/api/user/{username}/watchlistpage_v2/{page}?sort_by=date_added_desc
  Origin: https://www.serializd.com
  Referer: https://www.serializd.com
  X-Requested-With: serializd_vercel
```

Intersect `items[].seasonIds` by `showId`. Any same-season overlap disproves
API-level exclusivity. `sort_by` is **mandatory** on both — omitting it is a 500,
not a default — and `date_added_desc` is the verified value. The envelope carries
`totalPages`, `numberOfShows`, `numberOfSeasons`.

`scripts/serializd-watchlist-spike.ts` remains the standing harness for the
authenticated/destructive steps if the API ever regains `/progress` and the
question reopens.
