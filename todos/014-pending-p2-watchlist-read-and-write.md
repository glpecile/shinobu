---
status: pending
priority: P2
---

# Watchlist read and write

Shinobu records what you have watched and nothing about what you want to watch — and it
has no surface that shows a want-to-watch back. One action should record want-to-watch on
every connected provider that applies to the item — a film releasing in November, a 1997
film never seen, a manga never started — reporting which provider took it and which did
not. One surface (`/watchlist` plus the home row) should merge every connected provider's
watchlist into one list, so the add has somewhere to land. And the surface should be able
to un-watchlist, because a watchlist you can see but cannot remove from is a dead end.

Plan: `docs/plans/0031-watchlist-read-and-write.md`.

> **Revised 2026-07-28.** This was scoped write-only. Three owner decisions reversed
> that: the read surface is in (OQ-1 → b), Serializd is a real write with a widened
> Worker allowlist (OQ-2), and removal is in scope (OQ-3). The write-only framing, the
> "no Serializd write" decision and the "removal out of scope" boundary below are marked
> as reversed rather than deleted, so the history stays legible.

> **Progress 2026-07-29.** PR A (write verb) and PR C1 (read surface) are merged.
> PR B (Serializd) and PR C2 (removal) are now built and green locally, with **two
> declarations deliberately left at `'manual'`**: Serializd's `watchlistWrite` waits
> on U10's account-bound mutual-exclusivity probe, and both Letterboxd verbs wait on
> U6's endpoint-capture spike. Everything else in those two PRs — Worker rules,
> adapters, the season guard, the AniList delete guard, the removal CTA and its
> unknown-membership rows — is in place. The registry flip is one token per provider.

> **Amended 2026-08-01 (plan 0035 U1/U2).** AniList's contribution to the read is now
> **CURRENT ∪ PLANNING**, not PLANNING alone: an anime you are actively watching is on
> your watchlist, and it was absent from `/watchlist` entirely. This is a **fourth
> selector** (`fetchWatchlistAnime`) — `fetchCurrentAnime`, `fetchPlannedAnime` and Up
> Next's PLANNING gate are unchanged, so the hard constraint below still holds and the
> gate doc's amendment says why (the gate restricts what PLANNING may *reach*; CURRENT
> was never the restricted status).
>
> Removal follows: a CURRENT entry has to be removable, and AniList still has no
> un-status, so `deleteAniListEntry` gained an `allowDestructive` opt-in that lifts the
> refusal clause **and only** the refusal clause. R36's other two invariants — the fresh
> in-effect read and the fresh id — are untouched. The picker earns the flag with a
> visible warning naming what is destroyed plus a second explicit press; a bare-PLANNING
> removal keeps its silent path byte-for-byte. **This reverses R36's status clause only**
> (owner decision 2026-08-01), not the guard.

## Why it can't happen today

`useLogMedia` is the only cross-provider write, and every part of it presumes a watch
happened: a reconcile pass, canonical-episode resolution through the plan-0027 ani.zip
round trip, `watchedAt`, `tags`, `rewatch`. None of that has a want-to-watch analogue.

`ProviderDescriptor` has one write axis (`canWrite`), and routing reads that single
flag. But the four providers give four different answers to this verb — Trakt confirmed
and transport-ready, AniList confirmed but data-loss-hazardous, Letterboxd's endpoint
unverified and web-banned, Serializd confirmed but season-keyed, proxy-gated and
data-loss-hazardous — so `canWrite` cannot express it.

The write dead end is visible on screen: an unreleased film's details page renders an
accented countdown (`ReleaseTimeline`, plan 0029) directly above a greyed-out `Not yet
released` button, and for manga or a series whose next episode Trakt cannot name,
`LogMediaButton` renders nothing at all.

The read dead end is just as visible: the app's only watchlist screen is
`/watchlist/letterboxd` — provider-branded, single-source, and invisible to a Trakt-only
or AniList-only user, who gets no watchlist row at all (`src/app/(tabs)/index.tsx:191`
gates it on `letterboxdUsername != null`).

## Owner decisions (2026-07-27)

- **Symmetric to logging** — one action routes to every connected, applicable, capable
  provider in parallel. Never a per-provider action the user picks a target for.
- **Applies to anything unseen** — all three `filmReleaseStatus` outcomes (`released`,
  `unreleased`, `unknown`) are valid targets. `release-gate.ts` is never a gate here,
  only a CTA-placement signal.
- **Watchlist is not the agenda** — Calendar's window stays today … today+6 (plan 0030
  R1, unchanged). A released-but-unseen film belongs on the watchlist and must not reach
  the agenda.
- **A new capability declaration**, not a reuse of `canWrite` — and three-state
  (`'write' | 'manual' | 'none'`), because a boolean `false` at the routing filter
  position deletes the provider from the report entirely, which is a silent drop.
- ~~**No Serializd write**~~ — **REVERSED 2026-07-28**, see below.
- ~~**Removal out of scope**~~ — **REVERSED 2026-07-28**, see below.
- **No confirm sheet** — the payload is the item and nothing else; one tap plus an
  inline result line.

## Owner decisions (2026-07-28)

- **Read + write.** The cross-provider watchlist read surface ships alongside the verb.
  AniList's contribution is the **PLANNING** list *(widened to CURRENT ∪ PLANNING on
  2026-08-01 — see the amendment above)*. **Hard constraint:** this must not
  re-open plan 0030's hole — Continue Watching, the "Your Anime" row and Calendar are
  behaviourally untouched, and the PLANNING gate (`features/up-next/compute.ts:229-235`)
  and the `CURRENT` selector filter (`state/queries/anilist.ts:153-160`) stay exactly as
  they are.
- **Serializd is a real write; widen the Worker proxy.** Two exact-match POST rules
  (`watchlist_v2`, `watchlist/remove_v2`), never a `startsWith` prefix. The read path
  needs no grant — it is already inside the `user/` GET prefix. **The owner's cited spec
  (`Velocidensity/serializd-py`) does not cover the watchlist at all** — zero hits for
  watchlist/bookmark at HEAD, nine calls, all already allowlisted. The endpoints come
  from three other corroborating sources instead (Serializd's own web bundle, a Django
  `DEBUG=True` URLconf leak, live 401-vs-404 probes), all recorded because both primary
  sources are fragile.
- **Removal is in scope.** It ships with the read surface, on every provider whose API
  supports it, degrading to a manual provider link where it does not. The read surface is
  what makes it honest: a merged entry knows which providers hold it, so a Remove row
  never acts against an item that was never added.

## Acceptance criteria

**Capability and write core**

- [ ] `ProviderDescriptor` carries **two** three-state declarations, `watchlistWrite` and
      `watchlistRemove`; `routing.ts` derives each verb's targets from them through the
      same pure split functions, never from `canWrite`, and never with an
      `if (provider === …)` at a call site. A `'manual'` provider lands in `manual`,
      never in neither list. `unsupportedWritePlatforms` stays one flat list — the verb
      axis splits, the platform axis does not.
- [ ] `runProviderWrites<V>` is the shared write core — extracted **in place** in
      `fan-out.ts`, not copied, with `fanOutLog` left as a thin wrapper so `todos/010`'s
      rename does not grow — preserving the completion-order → routing-order rebuild
      and the missing-adapter-throws rule. `useLogMedia`'s behaviour is byte-identical.
      The add verb, the Serializd adapter and the remove verb are all callers of it.

**Data integrity**

- [ ] An AniList entry that **exists at all** is never written over: the mutation is not
      issued and the outcome is a reason-carrying skip naming the existing status. The
      guard is **fail-closed** — a failed guard read is an `error`, never a write — and
      is always a fresh in-effect read, never the query cache and never
      `useIsWatchlisted`.
- [ ] A Serializd watchlist write **never clears watched state**: only eligible, unwatched
      season ids are sent (specials and year-based seasons excluded), a show with none is a
      reasoned skip, a *partial* filter is reported with its reason rather than a bare
      `ok`, and a failed progress read is a fail-closed `error` with **no POST issued**.
      "Unwatched" is read from the **raw** `/progress` body — a season present in
      `watchedSeasons` counts as watched even with an empty `watchedEpisodes` array, which
      `getWatchedEpisodeKeys` cannot express. **Remove applies the same filter**, and the
      account-bound probe covers both directions before the Serializd PR merges.
- [x] An AniList **removal** deletes only a **bare** `PLANNING` entry — refused for any
      other status, `progress > 0`, `repeat > 0`, a score, notes, a `startedAt` or a custom
      list, because `DeleteMediaListEntry` destroys all of it. The guard is a **fresh
      in-effect read** immediately before the delete (never the cached watchlist surface,
      whose 15-minute snapshot would authorize destroying an entry the user has since
      started elsewhere), and the delete uses the id that fresh read returned.
      *(Amended 2026-08-01, plan 0035 R3: the refusal — and nothing else — is lifted by
      an explicit `allowDestructive` opt-in, which the picker earns with a destructive
      warning and a second press. The fresh read and the fresh id are unconditional.)*
- [ ] A mid-run AniList PLANNING entry created by this feature appears **nowhere** in Up
      Next — in particular never in Continue Watching — and **does** appear in the new
      watchlist surface. One **four-way** test (plan 0035 U1) asserts all of it and names
      `anilist-shared-list-query-status-gate.md`.
- [ ] Trakt reports already-there from its own write response (`existing: 1`), with no
      per-item membership read issued; a 420 surfaces as a specific limit-exceeded
      message and is not retried. Its remove mirrors it (`deleted: 0` + empty
      `not_found` → reasoned skip) and has no 420.
- [x] Letterboxd is a manual `Add on Letterboxd` / `Remove on Letterboxd` target on web,
      always — no Worker POST rule, no request to `/api/letterboxd/*`.

**Reporting**

- [ ] Every writable provider yields exactly one outcome (`ok` | `error` | `skipped`)
      **in routing order**; every manual provider renders an upfront row
      (`providerItemUrl ?? providerHomeUrl`) before any tap. Failed and reasoned-skip
      outcome links keep `manualLinkForOutcome`'s existing semantics — item URL only,
      no home fallback. Never a silent drop.
- [ ] The payload crossing the routing boundary is the `NormalizedMediaItem` only — no
      episodes, no season, no `watchedAt`, no `tags`, no `rewatch`. Watchlisting a show
      is show-level at the surface; Serializd's season enumeration is contained inside
      its adapter.

**Serializd Worker contract**

- [x] The allowlist gains exactly **two exact-match POST rules** and nothing else; the
      eight **named** existing tests in `worker/serializd-proxy.test.ts` are extended to
      cover them, including the assertion that `watchlist/random`, `watchlist`,
      `watchlist/add`, `watchlist_v2/extra` and the percent-encoded
      `watchlist_v2%2F..%2Flogin` all → **404** (the proof it is not a prefix grant).
      **Not** `watchlist_v2/../login` — URL normalization turns that into `login`, an
      allowlisted POST that forwards; traversal is blocked by normalization plus
      exact-match rules, not by `isUnsafePath`.
- [x] The plan-0017 amendment, the AGENTS.md § Web & CORS parenthetical (plus the
      "exact-match, never a prefix" sentence), and
      `docs/solutions/serializd-watchlist-endpoints.md` land in the **same PR** as the
      adapter, and the amendment states plainly that serializd-py does not cover the
      watchlist and names the one-token registry flip as the standing rollback.

**Agenda and cache coherence**

- [ ] A successful add invalidates the provider keys **then** `upNextQueryKeys.inputs()`
      **then** `watchlistQueryKeys.inputs()` — **three** derived AniList keys
      (`currentAnimeEntries()`, `currentAnime()`, `plannedAnime()`); both
      `watchlist(username)` and `watchlistPages(username)`; new Trakt `myCalendarRoot()`
      **and** `watchlistRoot()` prefix builders — all inside `mutationFn`, not
      `onSuccess`, so it still runs when the calling component unmounts.
      `refreshNotifications` is called with `throttle: false` on native **only when the
      item carries a future instant inside the notification window**; otherwise not at
      all. **No optimistic cache patch** anywhere. Each key is registered by the unit that
      creates it — `watchlistRoot()` and `plannedAnime()` land in `invalidateAfterLog` in
      the same units that add them, and `watchlistQueryKeys.inputs()` joins
      `invalidateAfterWatchlist` when the surface ships, not with removal.
- [ ] `useDisconnectProvider` purges `watchlistQueryKeys.all` — the merged surface is the
      **second** cross-provider query root (Up Next is the first), so without it
      disconnecting Trakt leaves that account's rows in the surface for the stale window
      and reconnecting as another account serves them.
- [ ] `watchlistQueryKeys.inputs()` is persisted (`PERSISTED_PREFIXES` + a `BUSTER` bump),
      so the row restores with the rest of the feed instead of popping in, and the settled
      label is genuinely correct after a restart.
- [ ] `invalidateAfterLog` also invalidates `traktQueryKeys.watchlistRoot()` — Trakt
      auto-removes watched items server-side, so without it a logged show sits in the
      watchlist surface for the full 15-minute stale window.
- [ ] A 1997 film added successfully changes nothing in the computed agenda and triggers
      no notification regather, but **does** appear in `/watchlist`. A
      theatrically-released film with a digital date next week legitimately *does* reach
      Calendar — that is plan 0030 working, not a leak.
- [ ] The Trakt watchlist read is **never** a second Calendar source: Calendar's Trakt
      half stays `/calendars/my/*`, `computeWatchlist` never returns `UpNextEntry`, and
      `fetchWatchlistInputs` is never called by `fetchUpNextInputs`.
- [ ] The Trakt watchlist read **always paginates explicitly** (`limit ≤ 250`, loop until
      a short page), against the blueprint's stale "Pagination Optional" badge, and the
      #681 drift is recorded in a new `docs/solutions/` file distinct from the #775 one
      already there. The paged loop is `getWatchedPages` generalized, not a second copy.

**Read surface**

- [ ] `/watchlist` is one cross-provider surface with no provider mark;
      `/watchlist/letterboxd` becomes a redirect, not a deletion. `YourWatchlistRow`
      loses its provider identity and its `letterboxdUsername` mount gate, so a
      Trakt-only or AniList-only user gets a watchlist row for the first time.
- [ ] The AniList leg costs **zero extra requests warm** — a selector over the
      already cached `currentAnimeEntries()` entry, not a new query — and 2 cold
      (`viewer()` then the list). Total surface cost is **0 warm from home**, up to 4 on a
      fully cold open. Never quoted as an unqualified "zero" or "3".
- [ ] The merged surface is **not** a `feedOptions` slot: the slot contract is
      `NormalizedMediaItem[]` and `useUnifiedFeed` is also mounted by the details screen,
      so a slot would break the type *and* run the gather on every details open. It is
      registered in `activeSectionKeys` for pull-to-refresh (with that function's
      trakt/anilist early return dropped so Letterboxd-only users are covered), and
      details-screen resolution goes through a new `findInWatchlistCache` that matches
      **every contributing item** — otherwise a Trakt- or AniList-sourced watchlist card
      opens the "Not found" screen.
- [ ] The Letterboxd contribution is `pages.flat()` of the **infinite** query, so
      `onEndReached` grows the merge and a 600-film watchlist still pages as it does
      today — no truncation to page 1, and appended films merge against Trakt rather than
      duplicating.
- [ ] Dedupe is a **merge**, not a suppression: colliding rows collapse into one entry
      whose `sources` is the union. Keys are tmdb+kind, then imdb, then exact
      `title|year` for film-like items — never fuzzy, and an unmatchable duplicate
      **stands** rather than being guessed at. No TMDB resolve fan over the Letterboxd
      watchlist, and no auto-paging it to complete dedupe.
- [ ] Partial failure on the merged grid is **one list plus an inline per-provider
      notice**, not a `SuspenseSection` per source — argued in the file's docblock as a
      structural divergence from AGENTS.md (dedupe needs every source in hand before
      anything renders), not slipped in. The notice names a provider **in a result**, and
      it is not a per-provider toggle.
- [ ] Hidden-items filtering runs over **every contributing id**, via a shared
      `visibleByIds` in `hidden-items.ts` that preserves the identity contract in its
      stronger form — the same array reference back whenever the filter removed *nothing*,
      not merely when the hidden set is empty, or Up Next's Continue Watching and Calendar
      lose their plan-0024 memoization as soon as one unrelated item is hidden. So a film
      hidden from the Letterboxd row cannot reappear as its Trakt twin, and
      `visibleEntries` becomes a one-liner over it, behaviourally unchanged. Hides stay
      one **global** provider-scoped set: hiding from `/watchlist` also suppresses that
      item elsewhere — accepted, and asserted in a test.
- [ ] Plan 0030 R12 and `anilist-shared-list-query-status-gate.md` are **amended** —
      both currently say PLANNING reaches Calendar *only*, which the read surface makes
      false, and tests cite that doc by name.

**Surfaces and copy**

- [ ] The CTA is a sibling of `LogMediaButton`, present for manga and for series with no
      nameable next episode; primary when a **film-like** item is unreleased or undated.
      The release consult never fires for series, so an airing show keeps its log button.
      No add row on the diary; the card sheet stays open through the write and renders
      the same result surface.
- [ ] The settled label's truth source is `useIsWatchlisted(item)` — **cache-only, never
      fetching**, three-state (`true` / `false` / `undefined` = today's behaviour) — so it
      is correct after an app restart, on a second device, and for an item added on the
      provider's own site. The shared `mutationKey` **pending** guard survives unchanged;
      only the settled-result derivation is retired.
- [ ] Removal is offered on `/watchlist` only, and writes **only to the providers in the
      entry's `sources`**, reusing the same write core and result surface with
      `Remove on` links. Absence from `sources` is **not** proof of absence: a connected,
      applicable provider with no read leg (Serializd in v1, AniList for MANGA) or whose
      leg errored renders an upfront manual `Remove on X` row, and the settled `Removed`
      label is withheld while any applicable provider's membership was unknown.
- [ ] Copy contains no provider name in any label and no mechanism word; the label morphs
      in place via `morphLabel` and does **not** settle on a mixed report.

## Risks

- **Serializd watched/watchlisted mutual exclusivity — data loss.** Serializd's own copy:
  *"You can't mark a show / season as 'Watched' and 'Watchlisted' at the same time"*.
  `season_ids` is required and show-level means all seasons, so writing them on a
  partly-watched show plausibly **clears those seasons' watched flags** — the Serializd
  analogue of the AniList status clobber. Guarded by a fail-closed progress read that
  sends only unwatched season ids. The destructive behaviour itself is **unverified and
  account-bound**; an explicit probe (mark S1 watched, watchlist S2 only, re-read; then
  repeat including S1) is a **stop condition** for the Serializd PR. If the API clears at
  show level regardless of `season_ids`, the filter protects nothing and Serializd reverts
  to `'manual'` by a one-token registry flip. Two corollaries: the guard's input must be
  the **raw** progress body (a season marked watched wholesale carries no episode rows, so
  the existing key-set helper cannot see it and the guard would fail open), and
  `watchlist/remove_v2` gets the same filter and its own probe step rather than an assumed
  "removal only clears watchlist flags".
- **Serializd's `GET /show/{tmdbId}` payload is unverified.** No show-details reader exists
  in the repo (only `resolveSeasonId`, one request per season), so the enumeration reader
  is a named deliverable and the probe must confirm the body carries per-season `id` and
  `episodeCount`. If it does not, an add costs **2 + N** requests, not 3.
- **AniList omit-field semantics** — whether `SaveMediaListEntry` with `progress`,
  `score`, `notes`, `startedAt` or `customLists` omitted preserves them is unverified and
  the schema cannot answer it (every arg is nullable). The guard refuses every entry that
  exists, so the mutation only runs where there is nothing to lose; a manual account-bound
  probe covering all those fields records the finding in `docs/solutions/`.
- **Letterboxd watchlist endpoint unknown** — the path listed in
  `letterboxd-no-api-fallback.md` sits in that file's superseded section and its sibling
  row was proven dead. A WebView fetch-hook capture must find the live endpoint first;
  otherwise Letterboxd ships degraded to a manual target on all platforms, stated in the
  PR.
- **Letterboxd toggle semantics — gates both verbs.** Unverified, and the site's control
  is a *toggle* ("Add to watchlist" / "In watchlist"), so a second tap may **remove** the
  film while Shinobu reports success. The capture must classify the endpoint (add-only /
  toggle / separate remove) and how the response says which happened. Toggle → **both**
  Letterboxd verbs stay `'manual'` by default; one narrow exception (toggle invoked from
  `/watchlist` only, where the row is itself the membership evidence) may be taken only
  if the spike recorded response discrimination, and must be argued in the PR. A page-1
  cache heuristic is never a mitigation for a destructive toggle.
- **Serializd endpoint evidence is fragile.** The Next.js bundle hash rotates on every
  frontend release and the Django `DEBUG=True` URLconf leak closes on any deploy — both
  discovery routes can vanish. The `_v2`/`_v3` suffix pattern is direct evidence Serializd
  versions by renaming and retiring; a `_v3` is the likeliest future breakage. Mitigated
  by recording everything now, plus the one-token registry rollback.
- **Serializd `items[]` element shape is unverified**, which is why the Serializd *read*
  is deferred — the envelope is confirmed live but every reachable profile returned an
  empty list. Consequence: Shinobu will write to a Serializd watchlist it cannot show
  back, the only remaining read/write asymmetry, named in the PR body. Second consequence:
  Serializd can never appear in an entry's `sources`, so its `watchlistRemove` stays
  `'manual'` (an upfront link) until the read leg lands, rather than shipping an
  unreachable adapter.
- **Trakt pagination drift.** Discussion #681 makes `/sync/watchlist` pagination required
  (default 100, max limit 250 from 2026-06-15) while the blueprint still badges it
  Optional — a *different* announcement from the #775 one the repo already documents.
  Always paginate explicitly, or the read silently truncates at 100. `extended=full,images`
  on watchlist rows is unverified; the existing `useTraktMediaImages` per-card recovery is
  the free fallback.
- **Double-fire** — pressto's debounce is per-instance and does not cover the same item
  mounted in a card and in a sheet over it, and neither does per-mount `useMutation`
  state. Defended by a `mutationKey`-shared **pending** guard read through
  `useMutationState` (kept, unchanged), plus provider upsert semantics where they are
  verified — Trakt's `existing` and AniList's branch 2 are, Letterboxd's are not,
  Serializd's are inferred from convention.
- **Manga want-to-read is still write-only.** `getCurrentAnime` hardcodes `type: ANIME`,
  so the zero-cost PLANNING selector is anime-only and a manga written to PLANNING is not
  shown back. Open question for the owner: ship the asymmetry, or pay +1 request for
  `MediaListCollection(type: MANGA, status_in: [PLANNING])`.
- **Request cost is not zero on the write path** — an AniList add is 1 guard read + 1
  mutation and a Serializd add is 3 requests, from every entry point including the card
  sheet where nothing is warm. No guard is ever sourced from the query cache to make it
  look free: a stale guard is a silent clobber, on the remove path as much as the add. The
  *read* surface is the opposite — 0 warm from home, up to 4 on a fully cold open — and
  that difference in order of magnitude is why the surface is affordable where a per-item
  membership toggle was not.
