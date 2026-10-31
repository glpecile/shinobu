# Plan 027: AGENTS.md, plan.md and the README stop steering agents toward banned patterns

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- AGENTS.md plan.md README.md`
> If plan 023 has landed, AGENTS.md's Effect bullet and Enforcement paragraph
> changed. That is expected and doesn't conflict. Any change to the sections
> below is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (docs only)
- **Depends on**: none. If plan 008 is in flight, both edit `README.md` in different sections.
- **Category**: docs
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

`AGENTS.md:11` sends agents to `plan.md` for architecture. `plan.md` §3.2 then
presents a "reference blueprint" that "Agents should focus on generating". It
uses React Native `Image`, `TouchableOpacity`, a hex `StyleSheet` and a solid
red non-log button, all of which this repo's lint or conventions ban, and
`StyleSheet.StyleSheet.create` doesn't compile. §3.1 tells agents to use
`Platform.OS` breakpoints, which contradicts AGENTS.md's Uniwind platform
variants. §1.2 still describes Letterboxd as an API by request and a "live
risk (`todos/004`)", but writes go through a WebView session and todo 004 is
done. AGENTS.md's Queries section says "`useLogMedia` is the only write hook",
yet the watchlist verbs and list writes have their own mutations. An agent that
follows these docs produces lint failures, or wrongly concludes that new write
verbs are forbidden. The README's "Getting started" also never mentions
`.env.template`.

## Current state

`plan.md` §3.1 bullet (~line 149):

```md
- Layouts must be explicit: Avoid using grid/flex calculations blindly that do not resolve cleanly on Expo Web. Use explicit platform breakpoints (`Platform.OS`).
```

`plan.md` §3.2 (~lines 153–211): the heading `### 3.2 Core Component Blueprint: The Aggregated Media Card`,
the sentence "Agents should focus on generating pure functional components.
Below is the reference blueprint …", and a ~55-line `tsx` block using
`Image`, `TouchableOpacity` and `StyleSheet.StyleSheet.create` with hex colours.

`plan.md` §1.2 Letterboxd bullet (~line 27):

```md
* **Letterboxd (REST)** — movies, including anime films. Read: diary/log entries. Write: create a log entry ... **Caveat:** API access is by request only — ... Treat this as a live risk to track (`todos/004`), not a solved integration. If access isn't granted, the CSV diary export/import path is the fallback degraded mode — not the primary design.
```

AGENTS.md "Providers" section says instead: "Letterboxd writes go through the
signed-in native WebView session, not an API key or CSV
(`docs/plans/0012-letterboxd-fallback-integration.md`)." On web they go through
the userscript (`docs/solutions/letterboxd-web-userscript-bridge.md`).

`AGENTS.md` Queries section (~line 284):

```md
Read hooks are `useXQuery` and `useSuspenseXQuery`, one per provider domain in
`state/queries/`, with one query-key builder per domain. `useLogMedia` is the
only write hook. Where a provider has a refresh grant, ...
```

Actual write mutations: `src/features/log-media/use-log-media.ts`,
`src/features/watchlist-media/use-watchlist-media.ts`,
`src/features/watchlist-media/use-unwatchlist-media.ts`, plus list mutations in
`src/state/queries/letterboxd.ts` and `src/state/queries/list-membership.ts`.
Confirm with `grep -rln "useMutation" src | grep -v test`.

`README.md` "Getting started" code block starts with `bun install`. `.env.template`
exists at the repo root and says "Copy to .env.local … Every variable is optional".

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check   | the greps in each step | as stated |

No build or tests are needed.

## Scope

**In scope**: `plan.md` (§1.2 Letterboxd bullet, §3.1 layout bullet, §3.2),
`AGENTS.md` (the Queries paragraph only), `README.md` ("Getting started" only).

**Out of scope**: the rest of `plan.md` (vision text stays), the
`docs/plans/*` history, and AGENTS.md sections other than Queries.

## Git workflow

- Branch: `docs/agent-guidance-drift`
- One commit: `docs: align plan.md and AGENTS.md with current conventions`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: plan.md §3.2

Replace the whole §3.2 (heading through the end of its code block) with:

```md
### 3.2 Components

The original card blueprint that stood here predates the repo's conventions
and is superseded. Build components by AGENTS.md: Uniwind classes composed with
`cn()`, `components/image` for posters, `components/button` and the pressables
in `components/presstable`, theme tokens from `src/global.css`, and
`useLogMedia` for logging. `src/components/media-card.tsx` is the live
equivalent of the old blueprint.
```

Confirm `src/components/media-card.tsx` exists. If it doesn't, name whichever
card component Home's rows render.

**Verify**: `grep -n "TouchableOpacity\|StyleSheet" plan.md` → no match.

### Step 2: plan.md §3.1 and §1.2

- Replace the `Platform.OS` bullet with: "Platform differences use Uniwind's
  `ios:`, `android:` and `web:` variants. Platform files are only for differing
  implementations (AGENTS.md)."
- Rewrite the Letterboxd bullet to: "**Letterboxd** — movies, including anime
  films. There is no public API. Reads use public pages and RSS (through the
  GET-only Worker proxy on web). Writes go through the user's signed-in session:
  a native WebView on iOS and Android, and a Tampermonkey userscript on web
  (`docs/plans/0012-letterboxd-fallback-integration.md`,
  `docs/solutions/letterboxd-web-userscript-bridge.md`)."

**Verify**: `grep -n "todos/004\|api@letterboxd.com\|Platform.OS" plan.md` → no match.

### Step 3: AGENTS.md Queries

Replace "`useLogMedia` is the only write hook." with "Writes are mutations:
`useLogMedia` for logs, the watchlist verbs in `features/watchlist-media/`, and
list edits in `state/queries/`. All of them report per-provider results."
Keep the rest of the paragraph.

**Verify**: `grep -n "only write hook" AGENTS.md` → no match.

### Step 4: README Getting started

Insert above the code block that starts with `bun install`: "Copy
`.env.template` to `.env.local` and fill in what you have. Every value is
optional, and features without a credential stay off."

**Verify**: `grep -n "env.template" README.md` → 1 match.

## Test plan

None. It's docs only.

## Done criteria

- [ ] All greps above pass
- [ ] `git diff --stat` shows only `plan.md`, `AGENTS.md`, `README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

- The owner treats `plan.md` as a frozen historical document (look for a note
  saying so at the top). Then do only steps 3–4 and report.

## Maintenance notes

- `plan.md` is still linked from AGENTS.md as the vision document. Keep code
  out of it; examples belong in `src/` where lint checks them.
