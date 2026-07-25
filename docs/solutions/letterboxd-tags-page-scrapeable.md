# Letterboxd tag index: `/{user}/tags/` is scrapeable (200, not Cloudflare-walled)

**Date:** 2026-07-25 · **Context:** the log sheet's Letterboxd tag picker (data layer)

Tags are the app's Letterboxd-only log field (`LogMediaVariables.tags`), and until
now the sheet offered a bare text input — the user had to remember and retype their
own vocabulary, which silently fragments a tag set ("nyff13" vs "NYFF13"). Suggesting
the tags a member already uses needs a source, and Letterboxd has no API
(`letterboxd-no-api-fallback.md`). So: spike before code, the same way the watchlist
and the diary pages were spiked.

## What was verified (2026-07-25, browser UA, plain HTTP client)

| URL | Result |
|---|---|
| `{user}/tags/` | **200**, ~69 KB, no challenge — the full film-tag index, **already sorted by frequency descending** |

Verified against `davidehrlich`. This is the notable part: the deeper diary pages
are **403 `Just a moment...`** for exactly this kind of client
(`letterboxd-diary-html-cloudflare-walled.md`), and the per-film AJAX endpoints are
walled too (`letterboxd-no-api-fallback.md`). The tag index is not. It sits with
`{user}/watchlist/` and `{user}/rss/` in the small set of public Letterboxd pages a
non-browser client can actually read, so no WebView channel is needed.

## The markup the scraper contracts on

```html
<ul class="js-tags-section tags tags-columns" data-edit-modal-action="/ajax/tag/edit/" ...>
    <li class="hoverable" >
        <a href="/davidehrlich/tag/criterion-collection/films/" title="criterion collection">criterion collection</a>
        <span class="detail -has-count">
            11
        </span>
    </li>
```

Three non-obvious details, all of which the parser is pinned to by fixture tests
(`src/lib/providers/letterboxd/tags.test.ts`):

- **The count is whitespace-padded** (`\n            11\n        `). Trim, then
  `Number()` — never a substring index.
- **The display name appears twice**, in the `title` attribute *and* as the link
  text. `title` is the reliable one (flat, no nested markup); the link text is only
  the fallback, and it is tag-stripped before use.
- **Tag names carry spaces and HTML entities** (`&amp;`, `&#39;`) — decoded with the
  same minimal table the sibling scrapers use. (Three copies of that table now exist,
  one per scraper module, each private to its file; consolidating them means touching
  `diary.ts` and `watchlist.ts`, a separate change.)

`parseTagsPage` is **total**: a missing `js-tags-section`, a shrunken attribute set,
or an unrelated page all yield `[]`. Suggestions are an enhancement — a shape change
at Letterboxd must degrade to no chips, never to a broken log sheet. Same reasoning
one layer up: `useLetterboxdTagsQuery`'s `queryFn` catches the tagged provider error
and resolves `[]`.

## The third proxy allowlist rule

Web reads go through the same-origin Worker relay (`worker/letterboxd-proxy.ts`, the
plan 0018 exception), so the page needs a rule:

```ts
{ match: (p) => /^[A-Za-z0-9_-]{1,39}\/tags\/$/.test(p) },
```

It stays inside the documented contract rather than widening it: GET-only,
reads-only, unauthenticated, one username-shaped segment, one public page, no new
headers, no credentials in either direction. Every other invariant is untouched —
no `Access-Control-Allow-Origin`, traversal rejection, ~30 s timeout, content-type
allowlist, script-killing CSP. The **trailing slash is load-bearing**: it keeps the
deeper tag-browse surface (`/{user}/tags/films/by/name/`, `/{user}/tag/{slug}/films/`)
a 404, so this rule can never drift into a general Letterboxd HTML relay. Tests in
`worker/letterboxd-proxy.test.ts` assert both halves.

## Two-source suggestions

The picker reads two independent lists and neither is required:

1. **Remote** — `useLetterboxdTagsQuery` (this page). Authoritative and ordered by
   real usage, but network-bound, Letterboxd-only, and stale by definition. Cached
   hard (6 h stale / 24 h gc) because the query fires on every sheet open while a tag
   vocabulary changes on the order of weeks.
2. **Local** — `state/prefs/recent-tags.ts`, a capped (30) most-recent-first MMKV
   list written by `use-log-media.ts` when a fan-out succeeds. Offline, instant, and
   the *only* source that knows a tag the user invented seconds ago — the remote page
   won't list it until the next scrape. Deduped case-insensitively because Letterboxd
   folds tag case.

If the remote read fails, or Letterboxd is connected read-only, or the user is
offline, the local list still carries the picker. If both are empty the sheet is
exactly what it was before: a text input.
