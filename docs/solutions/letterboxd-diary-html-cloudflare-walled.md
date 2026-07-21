# Letterboxd diary: RSS works, deep-history HTML pages are Cloudflare-walled

**Date:** 2026-07-21 · **Context:** plan 0016 (Unified Diary), U3 verification spike

Before building an HTML parser for deeper Letterboxd diary history
(`{username}/films/diary/page/N/`), plan 0016 required a fetch-and-inspect spike
to confirm parseable markup and no Cloudflare challenge — the same pre-code
verification the watchlist got. **The spike failed for pagination.** Ship the
RSS window only (the documented scope reduction, not a blocker).

## What was verified (2026-07-21, app-like iOS UA, plain HTTP client)

| URL | Result |
|---|---|
| `{username}/rss/` | **200**, ~100 `<item>` entries, real `tmdb:movieId` — the primary source, unchanged from `letterboxd-no-api-fallback.md` |
| `{username}/films/diary/page/1/` | **302** → `/{username}/diary/` (the `films/diary` path is a redirect alias) |
| `{username}/diary/` | **200**, 100 `diary-entry-row` nodes — first page parses fine |
| `{username}/diary/page/2/` | **403** `<title>Just a moment...</title>` — **Cloudflare challenge** |

So the *first* diary page is reachable, but **every deeper page is
Cloudflare-challenged** for a non-browser client — exactly the interstitial that
walls the per-film AJAX endpoints (`letterboxd-no-api-fallback.md`). Deep history
is the only reason to scrape HTML at all (RSS already covers the recent window
with *better* data — real TMDB ids the HTML rows lack), and it is precisely the
paginated path that is blocked.

## Decision

- **Letterboxd diary = the RSS window only.** `getDiary` reads
  `https://letterboxd.com/{username}/rss/` and normalizes its `<item>`s
  (`tmdb:movieId`, `letterboxd:filmTitle`/`filmYear`, `letterboxd:watchedDate`,
  `letterboxd:rewatch`, `guid`). No HTML diary parser is built.
- The diary infinite query exhausts after the single RSS page, so Letterboxd
  drops out of the watermark merge early (plan 0016 KTD3) — the recent window
  still shows, and deeper Trakt/AniList history keeps paginating past it.
- Native-only on web, unchanged (`web-cors-letterboxd.md`): letterboxd.com sends
  no CORS headers, so the RSS read is gated off on web the same way the watchlist
  read is.
- If Letterboxd deep diary history is ever wanted, it needs the WebView channel
  (which holds `cf_clearance`), the same conclusion the write path reached — not
  a plain HTTP scrape.

## Reproduce

```
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
curl -s -A "$UA" -o - "https://letterboxd.com/{username}/diary/page/2/" | grep -i 'just a moment'
```
