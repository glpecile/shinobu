---
status: pending
priority: P2
---

# Unreleased Items in the Agenda

Let the Calendar section carry things the user has not started or that are not out
yet — watchlisted shows, AniList plan-to-watch anime, and upcoming film releases —
and notify on release.

Plan: `docs/plans/0030-unreleased-agenda.md`.

## Why it can't happen today

Both halves of Up Next are seeded from *watched* lists — Trakt
`getWatchedShows()` → 20-show pool → `progress/watched`, and AniList
`getCurrentAnime()` hardcoded to `status: CURRENT`. A show you have never watched
an episode of cannot reach Calendar regardless of when it airs. There is no Trakt
watchlist read in the codebase; the "Your Watchlist" feed row is a Letterboxd
scrape.

## Owner decisions (2026-07-27)

- Fold into the **existing 7-day Calendar** — no separate longer-horizon section,
  no widened window.
- A film contributes **theatrical and digital as separate labelled rows**.
- Sources: Trakt watchlist (via `/calendars/my/*`), AniList PLANNING, Letterboxd
  watchlist. Not Serializd.
- Notifications ride the **existing batch and single toggle**; date-only releases
  fire at **09:00 local**.
- `/calendars/my/shows` **replaces** the progress-fan as Calendar's Trakt source,
  accepting that Calendar shows the episode airing this week even when the user is
  behind.

## Acceptance criteria

- [ ] A watchlisted, never-watched show premiering inside the window appears in
      Calendar, with no quick-log affordance.
- [ ] A film releasing inside the window appears as two labelled rows
      ("In theaters", "Streaming"), deduped across Trakt and Letterboxd.
- [ ] An AniList PLANNING anime that is already mid-run appears **nowhere** —
      in particular never in Continue Watching.
- [ ] Continue Watching is behaviourally unchanged.
- [ ] Shows past the old 20-show pool cap now reach Calendar.
- [ ] Release notifications fire at 09:00 local on release day, never midnight,
      and never retroactively.
- [ ] Each new source fails independently; hidden items stay hidden.

## Risks

- **AniList PLANNING leak** — `normalizeCurrentAnimeEntry` drops `status`, and one
  query feeds both the "Your Anime" row and Up Next. Ungated, plan-to-watch floods
  Continue Watching. This is the likeliest regression.
- **Letterboxd resolve cost** — the scrape carries no dates and no TMDB id, so each
  film costs 2 TMDB calls. Year-filtered and capped at 30; ships degraded if the
  measurement gate fails.
- **Trakt streaming-calendar path** — confirm against a live response; falls back to
  TMDB `releaseCalendar.digital`.
