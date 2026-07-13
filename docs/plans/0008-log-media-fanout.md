---
status: in-progress
date: 2026-07-10
---

# 0008 — Log Fan-Out (`useLogMedia`) with Trakt as First Live Target (todos/005)

## Context

The Trakt write adapter (`logToTrakt`, plan 0006 decision 7) exists but nothing
calls it — there is no way to log a watch from the UI. Per AGENTS.md ("never
create separate per-provider log hooks"), "log to Trakt" ships as the
**fan-out mutation** with Trakt as its only live adapter today, not as a
Trakt-specific hook that gets refactored later. Solutions scan done: nothing
under `docs/solutions/` touches `/sync/history` yet; `trakt-oauth-setup.md`
and `web-cors-trakt.md` confirm authed writes work identically on web.

## Decisions

1. **Location**: `src/features/log-media/` — the first `features/` vertical
   slice (AGENTS.md project structure). It bridges screens and data:
   - `use-log-media.ts` — the `useLogMedia` mutation (naming per AGENTS.md).
   - `fan-out.ts` — pure fan-out logic, unit-tested without React or network.
   - `log-media-button.tsx` — the shared "Mark as watched" trigger.
2. **Adapter map, not a switch.** `LOG_ADAPTERS: Partial<Record<ProviderId,
   LogAdapter>>` maps each provider to a `(variables) => Promise<void>`.
   Today only `trakt` has an entry (wrapping `logToTrakt` behind
   `Effect.runPromise` — the Effect containment boundary, same contract as
   `state/queries/*`). AniList (`todos/002`) and Letterboxd (`todos/004`) land
   by adding entries, nothing else changes.
3. **Targets come from `providersForLog`** (routing.ts) — connected ∩
   applicable ∩ write-capable, anime-film edge case included. A target with no
   adapter yet resolves to an `error` outcome ("not implemented"), never a
   silent skip: if a future provider is connectable before its write adapter
   exists, the user sees the truth.
4. **Partial failure is the return type.** The mutation resolves with
   `LogMediaResult { outcomes, succeeded, failed }` — one outcome per target
   provider, `{ status: 'ok' } | { status: 'error', message }`. It only
   *throws* (→ `mutation.isError`) when there is nothing to attempt (no
   connected provider applies). UI renders per-provider results from `data`,
   per the AGENTS.md partial-failure contract.
5. **Cache invalidation on success**: a Trakt success invalidates
   `traktQueryKeys.watchedShows()` so the feed's progress reflects the write.
   Future adapters invalidate their own read keys from the same `onSuccess`.
6. **UI scope (basic)**: `LogMediaButton` renders on the details screen for
   *directly loggable* items — movies and anime films (`isFilm`). TV logging
   requires choosing a season/episode (`logToTrakt` requires `episode` for
   TV); the season picker is **out of scope** here and belongs to the Up Next
   work (`todos/006`), where "next unwatched episode" gives the natural +1
   target. The mutation API already accepts `episode`, so the picker is purely
   additive.
7. **`watchedAt` is surfaced as a "Watched on" field in the sheet**
   (2026-07-13): defaults to "just now" (omitted → Trakt records now), with a
   date picker for backdating (`maximumDate` = now). Platform-split inside
   the feature (`watched-at-field/`): `@expo/ui/community/datetime-picker`
   natively (SwiftUI/Compose-backed drop-in for the community picker — user
   preference, 2026-07-13; no config plugin), the browser's
   `<input type="date">` on web. The web input *displays* today while the
   value is still "just now" (an empty mm/dd/yyyy placeholder reads as
   broken); picking today maps back to "just now" rather than a frozen
   open-time timestamp. Picked days keep the current time-of-day so
   the stored instant stays inside the chosen *local* date instead of a
   midnight boundary that shifts a day in UTC.
8. **Logging is a two-step action behind a confirmation sheet** (user
   re-prioritization, 2026-07-13): the details button only opens a
   `@swmansion/react-native-bottom-sheet` modal (wrapped once as
   `components/sheet`, controlled `open`/`onClose`; the lib has no web build,
   so `index.web.tsx` falls back to a bottom-anchored RN `Modal`). The
   mutation fires from the sheet's confirm button. Full success closes the
   sheet; partial failure keeps it open with the per-provider breakdown.
9. **Rewatch awareness**: `useTraktWatchedInfo(item)` (backed by the new
   `/sync/watched/movies` read + the existing watched-shows query) drives
   both a "Watched N× · date" line on details and rewatch copy on the
   button/sheet — logging an already-watched item reads "Log rewatch", never
   a duplicate-looking "Mark as watched".
10. **Haptics via Pulsar** (`react-native-pulsar`) behind `lib/haptics`
    (semantic API: `confirm`/`success`/`error`/`selection`; no-op on web —
    pulsar has no web implementation and iOS Safari lacks the Vibration
    API). Confirm press → impact, all-providers success → notificationSuccess,
    any failure → notificationError. Both new libs are wrapper-only imports,
    oxlint-enforced.

## Verification gates

- Unit (`bun test`, no network): fan-out returns per-provider outcomes —
  all-ok, mixed ok/error, adapter-missing → error outcome, parallel dispatch.
- Live (needs a connected Trakt account): log a movie from details, see it in
  Trakt's web history, watched-shows query refetches. Any `/sync/history`
  surprise → `docs/solutions/trakt-*.md` before closing `todos/005`'s Trakt
  slice.

## New dependencies

`@swmansion/react-native-bottom-sheet` (Fabric native component),
`react-native-pulsar` (TurboModule; `react-native-worklets` peer already
satisfied by Reanimated 4), and `@expo/ui` (SwiftUI/Compose views; its
`community/datetime-picker` entry point is the drop-in replacement for
`@react-native-community/datetimepicker`, which is lint-banned; no config
plugin). All ship native code → **dev-client rebuild required**:
`bun ios.clean` / `bun android.clean`. Web needs no rebuild (all three are
platform-split with JS/DOM fallbacks).

## Out of scope

- TV episode picker (needs Up Next / progress model, `todos/006`).
- Undo/remove-from-history.
- AniList/Letterboxd adapters (`todos/002`, `todos/004`).
