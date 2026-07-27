---
title: Release Dates Timeline - Plan
type: feature
date: 2026-07-27
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: owner-report
execution: code
---

# Release Dates Timeline - Plan

## Goal Capsule

A film's release dates get their own section on the details screen: theatrical
and digital (and physical), in order, instead of the single muted
"Digital release · Jul 14, 2026" line wedged under the meta line.

- **Authority:** AGENTS.md overrides this plan where they conflict (theme
  tokens only, `cn()` for every composed className, kebab-case filenames,
  timezone-correct date comparison through `lib/time`, React Compiler — no
  manual memo).
- **Landing strategy:** one branch, one PR. Three treatments (tiles / timeline /
  strip) were mocked for the owner; the timeline was chosen and is the only one
  implemented.

---

## Product Contract

### Summary

The details header carries at most one release fact today: the earliest
worldwide *home* release, collapsed into one date plus a label that has to
hedge ("Digital & physical release" when the two share a day). The theatrical
date is nowhere on the screen, even though TMDB already sends it in the same
payload — so "it's out in cinemas, when can I watch it at home?" (the actual
question a viewer opens an unreleased film to ask) is unanswerable.

### Behaviour

- A movie shows a **Release** section under the header: one row per known
  release kind — In theaters / Digital / Physical — ordered by date, connected
  by a rail.
- A row whose date has **not** yet arrived in the viewer's timezone is
  accented and leads with a countdown: "In 12 days · Aug 8, 2026".
- Fewer kinds means fewer rows; one kind is a valid one-row rail. No kinds at
  all (every TV/manga item, any movie TMDB didn't answer for, no TMDB token)
  means **no section** — not an empty shell.
- The old inline home-release line is gone. The section replaces it.

---

## Technical Contract

### KTD1 — the normalized contract carries a calendar, not one date

`homeReleaseDate` + `homeReleaseKind` (with its `'both'` case) collapse to
`releaseCalendar?: ReleaseCalendar` on `NormalizedMediaItem` —
`{ theatrical?, digital?, physical? }`, each a bare `YYYY-MM-DD`. The old pair
existed to label one collapsed date honestly; with a row per kind there is
nothing left to collapse, so keeping both shapes would only let them disagree.

`earliestHomeRelease` becomes `earliestReleaseDates`, same rule per kind: the
**earliest worldwide** date across every region, not the device locale and not
US-only (owner decision, plan 0025-era polish pass — unchanged here).

TMDB release type 1 (Premiere) is deliberately **not** theatrical: a festival
screening months ahead of release would read as "in theaters" and make every
date under it wrong. Types 2 (limited) and 3 (wide) share the theatrical slot,
earliest wins.

No new request: `/movie/{id}` is already fetched with
`append_to_response=credits,release_dates` (plan 0014).

### KTD2 — ordering is chronological, kind is only the tie-break

`releaseStops` sorts by date, because the dates are the story — the gap between
theatrical and digital is what the section is read for — and a re-release can
genuinely list a kind out of the usual order. A shared date falls back to
theatrical → digital → physical, so a same-day digital+disc drop never renders
physical first.

### KTD3 — "upcoming" goes through `lib/time/has-aired`

A bare TMDB date is compared as **local** midnight (AGENTS.md "Up Next &
Timezones"), so a release lands for the viewer on the viewer's own calendar
day, and a film released today reads as released — consistent with the log
button, which accepts it from midnight on. The countdown reuses
`formatRelativeDay` rather than a second phrasing.

Display formatting parses the *other* way — UTC, via the new shared
`lib/time/calendar-date` — so "Feb 27, 2024" is Feb 27 west of Greenwich too.
The two parses answer different questions and are documented as such;
`features/person`'s private copy of that formatter now imports the shared one.

### KTD4 — the section is a feature, its geometry is pixel-fixed

`features/release-timeline/` splits pure (`stops.ts`, unit-tested) from render
(`release-timeline.tsx`). Rows are a fixed 36px because every row is a single
line; the connector trunk and dot are absolutely positioned off that constant,
the same technique as the diary's tree connector — the trunk stops at the dot
on the first and last row, and a lone stop draws no trunk at all.

---

## Verification

- `bun test` — `releaseStops` ordering, tie-break, upcoming/countdown,
  today-counts-as-released, junk-value drop; `earliestReleaseDates` per-kind
  extraction, premiere exclusion, limited-vs-wide, empty payloads; both
  metadata merges carrying `releaseCalendar`.
- `bun typecheck`, `bun lint`, `bun check:classnames`.
- Manual: a released film (three rows), an unreleased-digital film (accented
  countdown row), a TV show (no section).
