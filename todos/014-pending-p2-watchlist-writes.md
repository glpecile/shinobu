---
status: pending
priority: P2
---

# Watchlist writes

Shinobu records what you have watched and nothing about what you want to watch. One
action should record want-to-watch on every connected provider that applies to the
item — a film releasing in November, a 1997 film never seen, a manga never started —
reporting which provider took it and which did not. Write-only: no toggle, no removal,
no membership read.

Plan: `docs/plans/0031-watchlist-writes.md`.

## Why it can't happen today

`useLogMedia` is the only cross-provider write, and every part of it presumes a watch
happened: a reconcile pass, canonical-episode resolution through the plan-0027 ani.zip
round trip, `watchedAt`, `tags`, `rewatch`. None of that has a want-to-watch analogue.

`ProviderDescriptor` has one write axis (`canWrite`), and routing reads that single
flag. But the four providers give four different answers to this verb — Trakt confirmed
and transport-ready, AniList confirmed but data-loss-hazardous, Letterboxd's endpoint
unverified and web-banned, Serializd with no known endpoint at all — so `canWrite`
cannot express it.

The dead end is visible on screen: an unreleased film's details page renders an accented
countdown (`ReleaseTimeline`, plan 0029) directly above a greyed-out `Not yet released`
button, and for manga or a series whose next episode Trakt cannot name, `LogMediaButton`
renders nothing at all.

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
- **No Serializd write** — no corroborated endpoint, and the only route in is widening
  the Worker path+method allowlist, a load-bearing security contract. It ships as a
  manual `'manual'` target: a link in the report, never an absent provider.
- **Removal out of scope** — with no membership read, un-watchlisting cannot be modelled
  honestly. Recourse is the existing "View on {Provider}" link.
- **No confirm sheet** — the payload is the item and nothing else; one tap plus an
  inline result line.

## Acceptance criteria

- [ ] `ProviderDescriptor` carries a three-state `watchlistWrite` declaration;
      `routing.ts` derives watchlist targets from it through the same pure split
      functions, never from `canWrite`, and never with an `if (provider === …)` at a
      call site. A `'manual'` provider lands in `manual`, never in neither list.
- [ ] `runProviderWrites<V>` is the shared write core — extracted **in place** in
      `fan-out.ts`, not copied, with `fanOutLog` left as a thin wrapper so `todos/010`'s
      rename does not grow — preserving the completion-order → routing-order rebuild
      and the missing-adapter-throws rule. `useLogMedia`'s behaviour is byte-identical.
- [ ] An AniList entry that **exists at all** is never written over: the mutation is not
      issued and the outcome is a reason-carrying skip naming the existing status. The
      guard is **fail-closed** — a failed guard read is an `error`, never a write.
- [ ] A mid-run AniList PLANNING entry created by this feature appears **nowhere** in Up
      Next — in particular never in Continue Watching.
- [ ] Trakt reports already-there from its own write response (`existing: 1`), with no
      watchlist read issued; a 420 surfaces as a specific limit-exceeded message and is
      not retried.
- [ ] Letterboxd is a manual `Add on Letterboxd` target on web, always — no Worker POST
      rule, no request to `/api/letterboxd/*`.
- [ ] Every writable provider yields exactly one outcome (`ok` | `error` | `skipped`)
      **in routing order**; every manual provider renders an upfront row
      (`providerItemUrl ?? providerHomeUrl`) before any tap. Failed and reasoned-skip
      outcome links keep `manualLinkForOutcome`'s existing semantics — item URL only,
      no home fallback. Never a silent drop.
- [ ] The payload is the `NormalizedMediaItem` only — no episodes, no season, no
      `watchedAt`, no `tags`, no `rewatch`. Watchlisting a show is show-level.
- [ ] A successful add invalidates the provider keys **then** `upNextQueryKeys.inputs()`
      (both `currentAnimeEntries()` and derived `currentAnime()`; both
      `watchlist(username)` and `watchlistPages(username)`; a new Trakt
      `myCalendarRoot()` prefix builder) — all inside `mutationFn`, not `onSuccess`, so
      it still runs when the calling component unmounts. `refreshNotifications` is called
      with `throttle: false` on native **only when the item carries a future instant
      inside the notification window**; otherwise not at all.
- [ ] A 1997 film added successfully changes nothing in the computed agenda and triggers
      no notification regather. A theatrically-released film with a digital date next
      week legitimately *does* reach Calendar — that is plan 0030 working, not a leak.
- [ ] The CTA is a sibling of `LogMediaButton`, present for manga and for series with no
      nameable next episode; primary when a **film-like** item is unreleased or undated.
      The release consult never fires for series, so an airing show keeps its log button.
      No row on the diary or the Letterboxd watchlist grid; the card sheet stays open
      through the write and renders the same result surface.
- [ ] Copy contains no provider name in the label and no mechanism word; the label morphs
      in place to the settled state via `morphLabel` when nothing failed — including the
      already-there case — and does **not** morph on a mixed report.

## Risks

- **AniList omit-field semantics** — whether `SaveMediaListEntry` with `progress`,
  `score`, `notes`, `startedAt` or `customLists` omitted preserves them is unverified and
  the schema cannot answer it. The guard refuses every entry that exists, so the mutation
  only runs where there is nothing to lose; a manual account-bound probe covering all
  those fields records the finding in `docs/solutions/`.
- **Letterboxd watchlist endpoint unknown** — the path listed in
  `letterboxd-no-api-fallback.md` sits in that file's superseded section and its sibling
  row was proven dead. A WebView fetch-hook capture must find the live endpoint first;
  otherwise Letterboxd ships degraded to a manual target on all platforms, stated in the
  PR.
- **Letterboxd add idempotency** — unverified, and the site's control is a *toggle*
  ("Add to watchlist" / "In watchlist"), so a second tap may **remove** the film while
  Shinobu reports success. The capture must classify the endpoint (add-only / toggle /
  separate remove) and how the response says which happened. Toggle → Letterboxd stays
  `'manual'`; a page-1 cache heuristic is not a mitigation for a destructive toggle. If
  it is add-only but duplicates, that heuristic is acceptable; never a full-list read
  (22+ pages, ~2.6 MB).
- **Double-fire** — pressto's debounce is per-instance and does not cover the same item
  mounted in a card and in a sheet over it, and neither does per-mount `useMutation`
  state. Defended by a `mutationKey`-shared pending guard and settled state read through
  `useMutationState`, plus provider upsert semantics where they are verified.
- **Nothing shows the add back** — outside the 7-day Calendar window a Trakt or AniList
  add has no in-app surface. Open question for the owner; if accepted, the settled button
  state is the only in-app evidence — shared across mounts, but still session state that
  is gone after a restart.
- **Request cost is not zero** — an AniList add is 1 guard read + 1 mutation, from every
  entry point including the card sheet where nothing is warm. The guard is never sourced
  from the query cache to make it look free: a stale guard is a silent clobber.
