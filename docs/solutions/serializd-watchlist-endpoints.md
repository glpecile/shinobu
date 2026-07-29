# Serializd watchlist endpoints — how they were found, and how to re-find them

**Discovered 2026-07-28** (plan 0031 U9 / KTD-9; plan-0017 amendment). Serializd's
API is unofficial and undocumented, and the project this repo's plan-0017 Appendix
leans on — `Velocidensity/serializd-py` — **does not cover the watchlist at all**.
So the three watchlist paths Shinobu depends on were derived from evidence, not
from a spec, and **both of the two discovery routes can close at any time**: the
Next.js bundle hash rotates on every Serializd frontend release, and the Django
`DEBUG=True` leak closes on any deploy. This file exists so the finding survives
them. Re-run the probes below rather than re-deriving anything.

## The endpoints

| Path | Method | Auth | Body / params |
|---|---|---|---|
| `watchlist_v2` | POST | bearer | `{show_id, season_ids: number[]}` |
| `watchlist/remove_v2` | POST | bearer | `{show_id, season_ids: number[], async: boolean}` |
| `user/{username}/watchlistpage_v2/{page}` | GET | headers only | `?sort_by=date_added_desc` (**mandatory**) |

The two POSTs are the whole of the `worker/serializd-proxy.ts` allowlist widening
— **exact `===`, never a `startsWith('watchlist')` prefix**, because
`watchlist/random` and `compare_watchlist/*` are real upstream routes that the
grant deliberately excludes. The GET needed **no** allowlist change: it was already
inside the pre-existing `user/` GET prefix rule.

## Why serializd-py is not the source

At `HEAD` (latest commit 2026-07-18) `Velocidensity/serializd-py` implements
exactly the nine calls the pre-existing proxy allowlist already covered.
`grep -rin "watchlist\|bookmark"` over the repo returns **nothing**, and there is
no open issue or PR adding one. It stays a valid corroborator for the *transport*
— base URL, the three app headers, the bearer scheme, the `{"message": …}` error
convention — and for nothing else. Citing it for the watchlist would be citing a
source that does not say the thing.

## Evidence (A) — Serializd's own Next.js bundle

The site's compiled client, verbatim (minified identifiers preserved so the
grep target is exact):

```js
a5=(e,a)=>l.post("/api/watchlist_v2",{season_ids:a,show_id:e})
```

```js
a8=function(e,a){let t=arguments.length>2&&void 0!==arguments[2]&&arguments[2];
return l.post("/api/watchlist/remove_v2",{show_id:e,season_ids:a,async:t})}
```

Same bundle, the copy that produced the KTD-10 named risk:

```
'You can\'t mark a show / season as "Watched" and "Watchlisted" at the same time'
"Added {{count}} season(s) to watchlist!"
"Removed all seasons from watchlist!"
"Specials not affected."
```

**Re-probe:** load `https://www.serializd.com/`, pull the `/_next/static/chunks/*`
script URLs out of the HTML, and grep the fetched chunks for `watchlist`. The
chunk **hash rotates on every frontend release**, so never hard-code a chunk URL —
always rediscover it from the HTML.

## Evidence (B) — the Django `DEBUG=True` URLconf leak

`GET https://serializd.onrender.com/api/__nope__` returns Django's **debug** 404
page, which enumerates the project's URL patterns instead of a generic 404. All
**251** patterns are listed, including:

```
api/watchlist_v2
api/watchlist/remove_v2
api/user/<username>/watchlistpage_v2/<page>
```

This is server-side ground truth for *path existence* (not for payload shape — the
URLconf lists routes, not serializers). **Re-probe:** request any implausible
`/api/<nonsense>` path and check whether the body is the pattern-listing debug page
or a plain 404. **This closes the moment Serializd deploys with `DEBUG=False`**,
which is why the pattern names are transcribed here rather than linked.

## Evidence (C) — live 401-vs-404 probes, with controls

The discriminator: on this API a **real route** answers
`401 {"message":"You must be logged in"}` when called unauthenticated, while a
**non-route** answers the Django HTML 404. Unauthenticated, with the three
mandatory app headers (`Origin`/`Referer: https://www.serializd.com`,
`X-Requested-With: serializd_vercel`):

| Probe | Result | Reads as |
|---|---|---|
| `POST watchlist_v2` | `401 {"message":"You must be logged in"}` | route exists |
| `GET watchlist_v2` | `405` | route exists, POST-only |
| `PUT watchlist_v2` | `405` | 〃 |
| `DELETE watchlist_v2` | `405` | 〃 |
| `POST watchlist/remove_v2` | `401` | route exists |
| `POST watchlist/remove` (no `_v2`) | Django HTML `404` | **does not exist** — the control |

The 405s are why the proxy rules are **POST-only**: the single-method rule mirrors
upstream rather than narrowing it. The `watchlist/remove` control is what proves
the probe discriminates at all — without a negative case, a uniform 401 would tell
you nothing.

## The read: `sort_by` is mandatory, and only one value is verified

`GET user/{username}/watchlistpage_v2/{page}` **requires** `sort_by`. Omitting it
is a **500**, not a default-and-continue — Serializd answered a bare-text 500 body
for the missing param, which is also why the proxy's force-JSON-`nosniff` rewrite
(`{"error":"upstream error"}`) is actively load-bearing on this path and not just
Render-cold-start insurance.

Only **`date_added_desc`** has been verified as an accepted value. The response
envelope (`totalPages` + `items[]`, 1 request per page) is confirmed live, but the
**`items[]` element shape is UNVERIFIED** — every reachable profile probed returned
an empty list. That is why plan 0031 R32 defers the Serializd watchlist *read* leg
rather than writing a normalizer against a guess. Next step when someone has a
populated account: capture one real `items[]` element verbatim, then add the leg.

## Named risk — evidence fragility, and the standing rollback

The `_v2` suffixes across `watched_v2`, `watchlist_v2`, `watchlist/remove_v2`,
`watchlistpage_v2`, `notifications_v2`, `activity_v3` are direct evidence that
Serializd versions by **renaming and retiring**. A `_v3` is the most likely future
breakage, and both discovery routes above may be closed when it happens.

**Standing rollback:** flip the registry's Serializd `watchlistWrite` /
`watchlistRemove` from `'write'` to `'manual'` — a one-token change. The
declaration is three-state, so `'manual'` is a real outcome (an upfront
"Add/Remove on Serializd" link), never a silent drop. The Worker rules can stay in
place through such a rollback — they are inert without a caller — or be reverted
with the same two-line diff.

**As of this writing they *are* inert.** The mutual-exclusivity probe (plan 0031
U10, `docs/solutions/serializd-watchlist-clears-watched.md`) has not been run, so
the registry declaration is still `'manual'` and nothing in the app calls either
POST. See the plan-0017 amendment § (e).

## Related

- `docs/plans/0017-serializd-provider.md` § Amendment — the watchlist grant — the
  reviewed contract change, invariant by invariant.
- `docs/solutions/web-cors-serializd.md` — why the proxy exists at all and what
  its invariants are.
- `worker/serializd-proxy.test.ts` — the eight named tests that hold the grant to
  those invariants, including the comment explaining why
  `watchlist_v2/../login` → 404 is a **false** assertion (URL normalization turns
  it into an allowlisted `login` POST that forwards).
