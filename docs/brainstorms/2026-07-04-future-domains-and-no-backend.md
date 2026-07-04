# Future Domains, Notifications & the No-Backend Line (2026-07-04)

Deep-dive session on three additions to the vision: future media domains (games /
books / music), the ideal onboarding ("plug in services → Up Next appears → get
notified on new episodes"), and hardening "we will never have a backend" from a vibe
into a policy. Decisions extracted into `docs/plans/0005-provider-capability-model.md`;
this file keeps the raw reasoning.

## Future domains: the API landscape is the constraint, not the abstraction

Named aspirations were "gaming services, reading like Goodreads, music like RYM."
Reality check as of mid-2026:

- **Books**: Goodreads killed its public API in Dec 2020 — no new keys, period. The
  realistic tracker is **Hardcover** (open GraphQL API, read + write). StoryGraph has
  no public API (CSV export only). Open Library is metadata, not tracking.
- **Music**: RYM/Sonemic's API has been "coming" for the better part of a decade;
  treat it as nonexistent. Realistic: **Last.fm** or **ListenBrainz** (both open).
  Note the semantic mismatch: their write is a *scrobble* (listened-at instant),
  not a progress update — a different log intent than watched/read.
- **Games**: Backloggd has no public API. **Steam** has a read-only Web API
  (owned library + playtime) — a provider that could appear in the feed but never
  in the log fan-out. IGDB (Twitch OAuth) is metadata only.

The pattern: **future providers are routinely read-only, write-only, or CSV-only.**
We already live this today — Letterboxd (`todos/004`) may never grant API access.
So the extensibility work isn't "add GAME to a union someday"; it's that the provider
registry must *declare capabilities* (`mediaTypes`, `canRead`, `canWrite`) and the
routing/feed logic must filter on them. That landed as
`src/lib/providers/{types,registry,routing}.ts`.

Deliberately **no fourth provider is named in the architecture docs** — the union
(`MediaType`, `ProviderId`) and registry are the only extension points, and we'll
validate against a concrete provider when one is actually chosen.

Knock-on effects on `NormalizedMediaItem` (landed in `src/types/media.ts`):

- `progressUnit` added — `currentProgress` stops implicitly meaning "episode index"
  the moment books (pages) or music (listens) arrive.
- Anime films signal via `isFilm: boolean`, not a fifth `MediaType` — the existing
  "routing isn't 1:1" insight generalizes instead of being special-cased.

## Notifications without a backend: air dates are known in advance

`todos/007` framed push as "the first server-touching feature." But the domain has a
gift: **release/air dates are known ahead of time.** So v1 needs no push infra at all:

- On app foreground, compute upcoming episodes/releases for tracked media and
  schedule **local notifications** (expo-notifications) for the next ~7–14 days.
- Must reuse the timezone-correct `hasAired` logic (`todos/006`) — a notification
  that fires before the episode aired locally is worse than a late one.
- Degradation: if the app isn't opened for weeks, the schedule goes stale.
  Accepted trade for a personal tracker.
- **Web cannot do this** — web push requires a VAPID push service (a server). Web
  gets the in-app Up Next feed only.

Ruling: **local-only now, door open** — if staleness proves painful, the only
acceptable exception to no-backend is a tiny *stateless* push relay (no DB, no
accounts), and that's a future decision, not a design input today.

## "No backend" pressure points are web-specific

- **CORS**: with no proxy, the browser must call provider APIs directly. AniList's
  GraphQL is browser-friendly; Trakt needs verification; Letterboxd unknown.
  Ruling: **if a provider blocks browser origins, it becomes native-only on web**
  ("connect on mobile") — no CORS proxy, ever. Spike early (`todos/008`) rather than
  discovering this mid-integration.
- **OAuth secrets**: Trakt's token exchange wants a `client_secret`; for an
  installed/open-source app the standard practice is shipping it in the bundle
  (Trakt tolerates this; device-code flow is the alternative). AniList's implicit
  grant is fully client-side with ~1-year tokens, no refresh. "No backend" therefore
  means client credentials live in the bundle — fine for this threat model (the
  tokens only unlock the *user's own* accounts).

## Onboarding end-state

Connect provider(s) → unified feed + Up Next appear immediately → native devices get
notified on new episodes. Mostly already implied by todos 001/002/005/006/007; the
new piece is `todos/009` (connect flow) and one landmine worth pre-registering:
Trakt "up next" requires a per-show progress call (`/shows/:id/progress/watched`) —
an N+1 that will hit rate limits for users with hundreds of shows. Cache aggressively
and compute progress only for recently-active shows from day one; write the findings
to `docs/solutions/` when first hit for real.
