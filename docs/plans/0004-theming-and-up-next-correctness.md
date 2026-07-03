---
status: done
date: 2026-07-03
---

# 0004 — Theme Tokens, Up Next Timezone Correctness, Notifications (Future)

## Context

Before any real screens get built, three things needed to be nailed down: where
colors live (so light/dark isn't retrofitted later), a correctness rule for the
upcoming "Up Next" feature (timezones are an easy way to get this silently wrong),
and a placeholder for a future notifications idea so it isn't lost.

## Decisions

- **Theming**: colors are Uniwind theme tokens in `src/global.css`
  (`@theme`/`@variant light|dark`), not hardcoded hex in components. Token set:
  `background`, `surface`, `foreground`, `muted`, `border`, `accent`,
  `accent-foreground`. `accent` (`#DC2626`, Vampiric Crimson) is pinned across both
  themes — brand color, not theme-adaptive. App follows OS theme by default
  (Uniwind `system` mode); dark is the primary/designed-for mode (`plan.md` 1.1) but
  light must render correctly. See `AGENTS.md` "Theming."
- **Up Next timezone correctness**: an episode is only "up next" once it has aired in
  the *user's* local timezone — not the show's origin timezone, not a naive
  date-only comparison. Centralize this in one utility (`lib/time/hasAired.ts`).
  Tracked as `todos/006` (P2, since the read-aggregation feed depends on it being
  right from the start, not patched in later).
- **Release notifications**: captured as an idea, not scoped for implementation
  (`todos/007`, P3). Open questions before it can move to `ready`: same timezone
  correctness dependency as Up Next, and a real infra decision (Expo push + EAS
  credentials vs. local-only scheduled checks) — this would be the app's first
  server-touching feature in an otherwise DB-less/serverless design.

## Verification

Updated `src/app/index.tsx` to consume the new tokens (`bg-background`,
`text-foreground`, `text-accent`, `text-muted`) instead of raw `dark:`/gray-scale
classes, as a smoke test that the token setup actually works end-to-end once the app
runs.
