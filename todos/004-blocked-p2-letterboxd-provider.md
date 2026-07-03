---
status: blocked
priority: P2
---

# Letterboxd Provider Integration

Letterboxd is a first-class provider, symmetric with Trakt and AniList — not a
one-time CSV backfill. See `plan.md` 1.2/1.3.

Letterboxd's official API supports OAuth (Authorization Code flow for member auth)
and write access (create a log entry: diary and/or review). **This is blocked**:
API access is granted by request only (email `api@letterboxd.com` with intended use),
and Letterboxd's stated policy explicitly excludes "personal projects" — approval is
not guaranteed. Request access before starting implementation; this todo cannot move
to `ready` until that's resolved.

## Acceptance Criteria (once access is granted)

- OAuth login flow works on web and native; token persisted via `react-native-mmkv`
  alongside the Trakt/AniList sessions (`state/session/`).
- `useLetterboxdDiaryQuery` (`state/queries/letterboxd.ts`) feeds Letterboxd entries
  into `useUnifiedFeed`, normalized into `NormalizedMediaItem`.
- A Letterboxd write adapter is registered in the provider routing table
  (`lib/providers/routing.ts`) so `useLogMedia` fans out to it for movies (including
  anime films) whenever the user has Letterboxd connected.
- Any API quirks discovered get written to `docs/solutions/letterboxd-*.md`.

## Fallback (if access is denied or during the wait)

Keep the CSV diary export/import path available as a degraded mode: parse a user's
exported Letterboxd CSV and replay it into Trakt via `/sync/history`, so Trakt at
least has continuous movie history even without a live Letterboxd write integration.
This is a fallback, not the target architecture — don't build the rest of the app
around it.
