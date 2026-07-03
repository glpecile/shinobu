---
status: done
date: 2026-07-03
---

# 0003 — Letterboxd as a First-Class Provider + Log Fan-Out

## Context

`0001`/`0002` treated Letterboxd as a one-time CSV backfill into Trakt, based on the
(incorrect) assumption that Letterboxd has no write API. Corrected via research: it
does — an OAuth Authorization Code flow with support for creating log entries
(diary/review) — but access is granted by request only, and Letterboxd's stated
policy excludes "personal projects," so approval isn't guaranteed.

More importantly, this surfaced that the app's actual purpose had been under-specified:
Shinobu isn't primarily a read aggregator with one write-capable backend (Trakt) and
two satellite sources. **The point of the app is to let a user log a piece of media
once and have it written to every tracking service they use.**

## Decisions

- Trakt, AniList, and Letterboxd are **symmetric, opt-in providers**. A user connects
  any subset via that provider's own OAuth; there is no Shinobu-owned account. See
  `plan.md` 1.2/1.3.
- The core write path is `useLogMedia` (`todos/005`, P1): given a `NormalizedMediaItem`
  + log intent, it fans out in parallel to every *connected* provider *applicable* to
  that item's type, via an explicit routing table (`lib/providers/routing.ts`) rather
  than inline type checks.
- **Anime films are the routing edge case**: `ANIME` in AniList terms, but also a
  `MOVIE` for Trakt/Letterboxd — a single log action may need to hit all three.
- Partial failure must be surfaced per-provider, never collapsed into one
  boolean/throw.
- Letterboxd's API access remains an open risk (`todos/004`, now `blocked`, not
  `ready`) — CSV import/export is the documented fallback if access is denied, not the
  primary design.
- `todos/001`/`002` (Trakt/AniList) now explicitly include building each provider's
  *write* adapter, not just the read query — `todos/005` depends on those adapters
  existing.

## Consequence

This changes what "done" means for the Trakt/AniList todos (read + write adapter, not
just read), and it means the read-aggregation architecture from `0001`/`0002`
(`useUnifiedFeed`) is now explicitly one half of a two-way loop, with `useLogMedia` as
the other half.
