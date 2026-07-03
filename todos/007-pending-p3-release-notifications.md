---
status: pending
priority: P3
---

# Release Notifications (New Episodes / Movie Releases)

Future idea, not yet scoped for implementation: notify the user when a new
episode airs for a tracked show, or when a tracked movie is released.

## Open Questions (resolve before promoting to `ready`)

- Source of truth for "when": Trakt calendar endpoints for TV/movies, AniList
  `airingSchedule` for anime — needs the same timezone correctness as `todos/006`
  ("Up Next"), since a notification fired before an episode actually airs locally
  would be worse than a late one.
- Delivery mechanism: Expo push notifications need a registered push token per
  device and (for iOS) APNs credentials via EAS — this is a bigger infra commitment
  than anything else in the app so far (the app is otherwise DB-less/serverless).
  Decide whether a lightweight server component is acceptable before starting, or
  whether local-only scheduled notifications (checked on app foreground) are enough
  for v1.
- Per-provider opt-in: should notifications respect which providers are connected,
  or apply to the whole unified feed regardless of source?
