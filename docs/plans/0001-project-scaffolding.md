---
status: done
date: 2026-07-02
---

# 0001 — Project Scaffolding

## Context

`plan.md` laid out the Shinobu vision but the repo had no code — just `plan.md`,
`README.md`, and IDE files. This session decided to follow the
[compound-engineering](https://every.to/guides/compound-engineering) loop
(Plan → Work → Review → Compound) and locked in the concrete stack before writing
any app code.

## Decisions

- **Expo (Router)** for a single Web/iPadOS/iOS/Android codebase.
- **Uniwind** for styling — supersedes plan.md's original NativeWind mention. Drop-in
  NativeWind replacement, faster, built by the Unistyles team.
- **[bluesky-social/social-app](https://github.com/bluesky-social/social-app)** as the
  golden-rule reference for cross-platform Expo conventions (it's the most mature
  open-source universal Expo app and ships its own CLAUDE.md covering exactly this).
- **TanStack Query** for all data fetching (Trakt REST + AniList GraphQL), backing the
  `useUnifiedFeed` hook.
- **`@react-native-async-storage/async-storage`** for persisted OAuth tokens — no
  backend/DB.
- **pnpm** as package manager.
- Compound memory lives in `docs/{brainstorms,solutions,plans}/` + `todos/` (per the
  article), replacing plan.md's original flat `COMPOUND_MEMORIES.md` proposal.
- Agent instructions live in `AGENTS.md` (tool-agnostic), with `CLAUDE.md` as a thin
  `@AGENTS.md` import so Claude Code auto-loads it every session.

## Scope

This pass: docs/agent scaffolding + running the Expo project-creation and
library-install commands only. No screens, no live Trakt/AniList calls, no UI code —
tracked as follow-up work in `todos/`.

## Commands Run

See `AGENTS.md` for the resulting conventions. Actual install commands and any
deviations from the plan are recorded in the session that executed this plan; consult
git history for `package.json` / `metro.config.js` if the exact versions matter later.
