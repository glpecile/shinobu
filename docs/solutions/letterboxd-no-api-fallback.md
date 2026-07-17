# Letterboxd without the official API: what works and what doesn't

**Date:** 2026-07-15 · **Context:** plan 0012, todos/004

The official API (`api-docs.letterboxd.com`) is request-only
(`api@letterboxd.com`) and the policy page explicitly excludes "private or
personal projects", data-analysis/visualization, and LLM-related use. An
access request has been drafted; do not block on it. Everything below was
verified empirically on 2026-07-15.

## Surfaces that work (no auth, any user agent)

- **Diary RSS** — `https://letterboxd.com/{username}/rss/` (HTTP 200 even with
  app-like UAs; 404 for a nonexistent user, which doubles as username
  validation). Per `<item>`: `letterboxd:filmTitle`, `letterboxd:filmYear`,
  `letterboxd:watchedDate` (bare date), `letterboxd:rewatch` (Yes/No),
  `letterboxd:memberRating`, `letterboxd:memberLike`, **`tmdb:movieId`**,
  `link` (`…/{username}/film/{slug}/`), poster `<img>` inside the CDATA
  `description`. Watches have `guid` `letterboxd-watch-{n}`, reviews
  `letterboxd-review-{n}` (reviews are also diary entries). Window: ~50 most
  recent entries.
- **Watchlist HTML** — `https://letterboxd.com/{username}/watchlist/`,
  paginated `/page/{n}/`, 28 films per page. Each film renders as a
  `<div class="react-component" data-component-class="LazyPoster" …>` with:
  `data-item-slug`, `data-item-name` (`"Title (Year)"`), `data-item-link`,
  `data-postered-identifier` (JSON: `uid: "film:{numericId}"`),
  `data-resolvable-poster-path` (JSON: `cacheBustingKey`). Poster `<img>` src
  is a lazy placeholder — the real art never appears in the HTML.

## Poster URLs are constructible

RSS poster URLs follow a CDN pattern that also works when built from
watchlist data:

```
https://a.ltrbxd.com/resized/film-poster/{id digits joined by /}/{id}-{slug}-0-600-0-900-crop.jpg?v={cacheBustingKey}
```

e.g. film id `1234878`, slug `tuner` →
`…/film-poster/1/2/3/4/8/7/8/1234878-tuner-0-600-0-900-crop.jpg`.

- The `?v=` cache-busting key is **optional** (200 without it).
- The CDN **validates the slug**: a wrong slug 403s. Some films' poster
  filenames use a *variant* slug (e.g. poster `obsession-2025-2` for film slug
  `obsession-2025`, an alternate-poster edition) — those constructed URLs 403.
  Treat a poster 403 as "no art" and render the placeholder; do not retry.

## Surfaces that do NOT work — never build on these

- `letterboxd.com/film/{slug}/json/` and `/film/{slug}/image-150/` (the
  LazyPoster metadata endpoints) sit behind a **Cloudflare challenge** for
  non-browser clients ("Just a moment…" interstitial). Full pages and RSS are
  not challenged; the AJAX-ish endpoints are.

## api-beta is a dead end for this project (confirmed 2026-07-16)

`letterboxd.com/api-beta/` is the same request-only beta as
`api-docs.letterboxd.com`, not a new self-serve tier. Its stated policy
**excludes personal/private projects AND "LLM or GPT-related use"** — Shinobu
is both. No reply to the access email. So the official OAuth API is out; the
write channel is the signed-in web session below.

## Write channel: signed-in web session (session capture)

Decided 2026-07-16 (plan 0012): the user signs into letterboxd.com themselves
(in a WebView on native), we harvest the session cookies, and issue the same
requests the website's own JS makes. Reconstructed from public write-ups
(petterhj.no "manage your Letterboxd profile with Python",
github.com/dado3212/letterboxd-scripts), **not** from account access — so the
shapes below are best-known, to be confirmed on-device.

**Session cookies** (from a completed browser login):
- `letterboxd.signed.in.as` — value **is the signed-in username** (derive it
  from here; no scrape needed).
- `com.xk72.webparts.csrf` — CSRF token; its value must be echoed as the
  `__csrf` body param on every state-changing POST.
- Plus the usual `_ga*`. Send them all as one `Cookie:` header.

**These write endpoints are NOT Cloudflare-walled** — petterhj drives them from
plain server-side Python (no browser), so once we hold the cookies, writes can
go over native nitro-fetch (real device IP/UA). Only the `/film/{slug}/json/`
AJAX endpoints above are challenged; `/s/…` form posts and full pages are not.

| Action | Method | Endpoint | Key body fields |
|--------|--------|----------|-----------------|
| Log in | POST | `/user/login.do` | `__csrf`, `username`, `password` (we let the WebView do this; we don't POST it ourselves) |
| Save diary entry | POST | `/s/save-diary-entry` | `viewingableUid` (`film:{id}`), `viewingId` (empty=new), `viewingDateStr` (YYYY-MM-DD), `specifiedDate`, `rewatch`, `liked` (checkboxes: presence only), `tags` (comma-separated), `rating` (0=unrated), `review`, `__csrf` |
| Mark watched | POST | `/film/{slug}/mark-as-watched/` | `__csrf` |
| Add to watchlist | POST | `/film/{slug}/add-to-watchlist/` | `__csrf` |
| Rate | POST | `/film/{slug}/rate/` | `rating`, `__csrf` |

### save-diary-entry body — corrected from the live form (2026-07-16)

The original row (from public reverse-engineering) was wrong on two fields and
the app got a **404** on every write as a result. Verified by extracting the
actual `<form action="/s/save-diary-entry" method="post">` off a live film page
(`/film/pareidolia-2023-2/`, unauthenticated GET — the form template is in the
page). A logged-out POST to the endpoint returns **403** (Cloudflare edge); the
app's authenticated POST reached the origin and got **404** — i.e. the route
existed but rejected our body shape, not the URL.

- **The film is identified by `viewingableUid` = `film:{numericId}`, NOT by a
  `filmId` field** — there is no `filmId` input on the form. Sending only
  `filmId=…` is exactly what produced the 404. The uid is on the film page as
  `data-production-uid="film:{n}"` and in the `production:identifier` meta
  (`{"lid":…,"uid":"film:{n}",…}`). Pages carry **no** `data-film-id`, so
  `parseFilmId` matches `data-production-uid="film:(\d+)"` first, then a bare
  `film:(\d+)`. Resolve for any movie via `GET /film/{slug}/` or the external-id
  redirect `GET /tmdb/{tmdbId}/` (302 → the film page).
- **Tags = one comma-separated `tags` text field** (confirmed: `<input
  name="tags">` + a `/s/autocompletetags` endpoint), NOT repeatable `tag`
  params. `writes.ts` joins with `, `.
- **Checkboxes submit by presence.** `rewatch`, `liked`, `specifiedDate`,
  `containsSpoilers` are `<input type="checkbox" value="true">` — a false one
  must be **omitted**, never sent as `=false` (the server reads any present value
  as checked, so `rewatch=false` would log a rewatch). Only `specifiedDate=true`
  (we always send a date) and `rewatch=true` when applicable are included.
- `viewingId` empty = create; a value = edit an existing entry.
- **CSRF can rotate.** The stored token may go stale on a long-lived session;
  `save-diary-entry` returns a fresh `csrf` in its JSON. Follow-up robustness:
  on a CSRF-rejection, `GET /` to refresh the cookie+token and retry once.
- Requests send `X-Requested-With: XMLHttpRequest` and a `Referer` — the `/s/`
  endpoints expect the same AJAX context the site uses.

**Superseded:** the earlier CSV-import write channel (`letterboxd.com/import`)
was rejected as unacceptable friction (plan 0012, 2026-07-15) and removed. It
also crashed native via `expo-file-system`/`expo-sharing`.
