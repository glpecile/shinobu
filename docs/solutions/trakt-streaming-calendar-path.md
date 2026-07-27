# Trakt's digital-release calendar is `streaming`, not `digital`

## Symptom

Plan 0030 (KTD-4) needs Trakt's digital/streaming release calendar to date
unreleased films in the agenda. It is the one endpoint in that plan the
published documentation disagrees about: community wrappers
([vankasteelj/trakt.tv](https://github.com/vankasteelj/trakt.tv/blob/master/docs/available_methods.md))
list only `my.shows`, `my.movies` and `my.dvd` and describe **no** digital
calendar at all, while docs.trakt.tv lists a streaming calendar without
spelling out its `my` path. Guessing wrong is a silent empty section, not an
error anyone would notice.

## Finding (probed live, 2026-07-27)

The `my` calendars are OAuth-authed and Trakt answers **401 before it validates
the calendar type**, so `/calendars/my/<anything>` returns `401 Unauthorized` —
`/calendars/my/bogus` included. A `my` path therefore cannot be discriminated
without a user token, and no user token exists in the repo (they live in MMKV
at runtime).

Its unauthenticated twin *can* be: `/calendars/all/{type}` shares the same type
namespace and needs only the client id.

```
GET /calendars/all/movies/2026-07-27/3     → 200  [{ movie, released }]
GET /calendars/all/dvd/2026-07-27/3        → 200  [{ movie, released }]
GET /calendars/all/streaming/2026-07-27/3  → 200  [{ movie, released }]
GET /calendars/all/digital/2026-07-27/3    → 404  'type' is required
GET /calendars/all/releases/2026-07-27/3   → 404  'type' is required
GET /calendars/all/movies/digital/…        → 405
```

So the type is **`streaming`**, and `digital` is not a calendar type at all.
Shinobu calls `/calendars/my/streaming/{start_date}/{days}`
(`getMyStreamingCalendar`, `lib/providers/trakt/reads.ts`) and stores its date
in `releaseCalendar.digital` — the Trakt path name and the normalized slot name
differ on purpose, because `ReleaseCalendar` is TMDB-shaped (plan 0029).

**Caveat:** confirmed against the `all` twin, not against an authed `my`
response. If `/calendars/my/streaming` ever answers 404 for a connected user,
KTD-4's fallback stands unchanged — the digital date comes from TMDB's
`releaseCalendar.digital`, which the details screen already renders, so no new
normalization is needed either way.

## Row shapes (all four calendars, probed the same day)

```
/calendars/*/shows      → { first_aired, released, episode, show }
/calendars/*/movies     → { movie, released }   // theatrical
/calendars/*/streaming  → { movie, released }   // digital
/calendars/*/dvd        → { movie, released }   // physical
```

- The show row's air instant is at the **row** level (`first_aired`, full ISO
  UTC); the embedded episode repeats it only under `extended=full`, and the
  row's is what Trakt bucketed the day by. Its top-level `released` is `null`
  for episodes.
- Movie rows state `released` as a **bare `YYYY-MM-DD`** — a calendar day, not
  an instant. `normalizeCalendarMovieRow` drops a row that isn't date-only
  rather than truncating an instant to ten characters, which would name the UTC
  day (the wrong local day west of Greenwich).
- Calendars **still return `images`** under `extended=full,images`. The 2026
  breaking change that stripped art
  (`trakt-watched-endpoints-2026-api-changes.md`) hit `/sync/watched/*` only, so
  calendar-sourced cards need no per-item art recovery.
- Trakt caps `{days}` at 33 on every calendar endpoint; `traktCalendarRange`
  clamps client-side so an over-long ask degrades to 33 days instead of a 4xx
  that would take the whole section down.

## Lesson

When a `my`/`all` endpoint pair exists and only the authed half is in question,
probe the unauthenticated half: Trakt validates auth before routing, so 401 is
not evidence a path exists. Wrapper libraries are also not evidence of absence —
they lag the API by years.
