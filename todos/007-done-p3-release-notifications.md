---
status: done
priority: P3
---

> **Done (2026-07-23):** Implemented per `docs/plans/0020-release-notifications.md`.
> Episode-airing notifications only (movie releases stay deferred — see that
> plan's Scope Boundaries). Local-only via expo-notifications, refreshed on
> app foreground (throttled) and by an `expo-background-task` WorkManager
> task (~12h, Android; opportunistic on iOS), gated by an opt-in toggle on
> Manage Trackers. All acceptance criteria below are met.

# Release Notifications (New Episodes / Movie Releases)

Notify the user when a new episode airs for a tracked show, or when a tracked movie
is released.

## Decided (docs/plans/0005) — delivery mechanism

**Local-only scheduled notifications, no push server.** Air dates are known in
advance, so on app foreground compute upcoming episodes/releases for tracked media
and schedule local notifications (expo-notifications) for the next ~7–14 days. This
keeps the app fully serverless. Known degradation: the schedule goes stale if the
app isn't opened for a while — accepted. **Door left open:** if staleness proves
painful in practice, a tiny *stateless* push relay is the only acceptable exception
to the no-backend rule; that is a future decision, not part of this todo.

Web gets no notifications (serverless web push doesn't exist) — the in-app Up Next
feed is web's equivalent surface.

## Acceptance Criteria

- On app foreground, upcoming air dates for tracked shows (Trakt calendar, AniList
  `airingSchedule`) are scheduled as local notifications for the next ~7–14 days,
  replacing any previously scheduled batch (no duplicates).
- Fire times are timezone-correct via `lib/time/hasAired.ts` logic — a notification
  before the episode actually airs locally is worse than a late one.
- Notifications respect which providers are connected (they derive from the same
  unified feed, so this falls out of the provider registry, not a separate setting).
- Native-only: no web code path pretends to schedule anything.

## Dependencies

Blocked on `todos/006` (timezone-correct air dates) and at least one connected
provider with airing data (`todos/001` or `002`).
