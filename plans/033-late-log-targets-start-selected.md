# Plan 033: A log target that appears after the sheet opens starts selected

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04643c8..HEAD -- src/features/log-media/log-confirm-sheet.tsx src/features/log-media/session/catch-up-log-sheet.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `04643c8`, 2026-11-12

## Why this matters

The two log sheets copy the list of write targets into state on their first
render. The target list comes from `useLogTargetsSplit`, which first returns
the targets it can compute without network, then **widens** when the id
lookup (`enrichExternalIds`) finishes. Example: an AniList anime film with
Letterboxd connected. On the first render the film has no movie-side id, so
the targets are AniList and Simkl. A moment later the lookup finds the TMDB
id and Letterboxd joins the targets. The picker now shows Letterboxd, but the
state copy does not contain it, so its row is **unchecked**. The user presses
Log, and Letterboxd gets no write and no row in the report. This happens each
time the sheet opens before the lookup is cached, for example from a card's
long-press or from Up Next.

After this plan, the sheets store only the providers the user turned off. A
target that arrives late is selected like the others.

## Current state

### Files

- `src/features/log-media/use-log-targets.ts` — `useLogTargetsSplit`. Read it
  to understand the data. Do not change it.
- `src/features/log-media/log-confirm-sheet.tsx` — `LogConfirmForm`, the
  one-shot form for films and season batches.
- `src/features/log-media/session/catch-up-log-sheet.tsx` — the episode
  catch-up chain's form.

### Excerpts

`src/features/log-media/use-log-targets.ts:20-48` (why the list widens):

```ts
/**
 * The providers a log of `item` would actually target, *after* identity
 * enrichment (plan 0011) — split into what the fan-out can write on this
 * platform and what can only be logged manually (plan 0022 R1/R2, e.g.
 * Letterboxd on web). Falls back to the unenriched split while the mapping
 * loads (it only ever widens). The mutation runs the same enrichment through
 * the same cache, so confirming doesn't refetch.
 */
export function useLogTargetsSplit(item: NormalizedMediaItem): LogTargetsSplit {
  ...
  return data ?? splitWriteTargets(item, connected, platform, 'log', letterboxdUserscript);
}
```

`src/features/log-media/log-confirm-sheet.tsx:352-355`:

```ts
const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
const completion = useLetterboxdCompletion(item);
const [completionOffer, setCompletionOffer] = useState<LogRequest | null>(null);
const [selectedProviders, setSelectedProviders] = useState(targets);
```

`src/features/log-media/log-confirm-sheet.tsx:439-447` (the retry path sets the
selection to the failed providers):

```ts
// Back to the form with only what failed selected: re-sending a provider
// that already landed would log the watch twice.
function retry() {
  if (result != null && result.failed.length > 0) {
    setSelectedProviders([...result.failed]);
    setRetryOf({ rewatch: result.rewatch });
  }
  logMedia.reset();
}
```

`src/features/log-media/log-confirm-sheet.tsx:503` passes the setter to the
form fields: `onSelectedProvidersChange={setSelectedProviders}`.

`src/features/log-media/session/catch-up-log-sheet.tsx:211-215`:

```ts
const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);

const [selectedProviders, setSelectedProviders] = useState(targets);
```

`src/features/log-media/session/catch-up-log-sheet.tsx:457` passes the setter:
`onSelectedProvidersChange={setSelectedProviders}`.

`selectedProviders` is read in both files in several places (the reconcile
warm-up, the confirm guard, the `providers:` field of the write). Those reads
stay as they are.

### Conventions that apply

From `AGENTS.md`:

- "Add state only for a fact nothing else owns, such as a draft, a selection,
  or an open sheet. … A form holds only the user's edits over the fetched
  values." The fix follows this: the user's edit is "I turned this provider
  off".
- No `useEffect` to copy the targets into state when they change. Derive
  during render. The lint plugin
  `eslint-plugin-react-you-might-not-need-an-effect` rejects the effect.
- React Compiler memoizes. Do not add `useMemo` or `useCallback` (lint bans
  them).
- The repo has no tests for these two sheet components. Do not add a
  component test.

## Commands you will need

| Purpose    | Command                         | Expected on success |
| ---------- | ------------------------------- | ------------------- |
| Install    | `bun install --frozen-lockfile` | exit 0              |
| Typecheck  | `bun typecheck`                 | exit 0, no errors   |
| Lint       | `bun lint`                      | exit 0              |
| Full tests | `bun run test`                  | all pass            |

## Scope

**In scope** (the only files you should modify):

- `src/features/log-media/log-confirm-sheet.tsx`
- `src/features/log-media/session/catch-up-log-sheet.tsx`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `src/features/log-media/use-log-targets.ts` and `enrich.ts`.
- `LogFormFields` and `ProviderPicker` props. They keep taking
  `selectedProviders` and `onSelectedProvidersChange`.
- `src/features/show-seasons/seasons-section.tsx`,
  `src/features/anime-seasons/anime-seasons-section.tsx`,
  `log-media-button.tsx`, `episode-log-button.tsx`. They read the split but
  hold no selection state.
- The watchlist sheets.

## Git workflow

- Branch: `fix/log-late-targets-selected`
- One commit: `fix(log): select a target that appears after the sheet opens`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `LogConfirmForm` stores the opt-outs

In `src/features/log-media/log-confirm-sheet.tsx`, replace

```ts
const [selectedProviders, setSelectedProviders] = useState(targets);
```

with

```ts
// The user's opt-outs, not a copy of the targets: the id lookup can add a
// target after the sheet opens, and that target starts selected.
const [deselected, setDeselected] = useState<ProviderId[]>([]);
const selectedProviders = targets.filter((id) => !deselected.includes(id));
const setSelectedProviders = (next: readonly ProviderId[]) =>
  setDeselected(targets.filter((id) => !next.includes(id)));
```

`ProviderId` is already imported in this file. Leave `retry()` and the
`onSelectedProvidersChange={setSelectedProviders}` prop as they are: they now
call the new function. `retry()` then means "turn off every target that did
not fail", which keeps its documented behaviour.

**Verify**: `bun typecheck` → exit 0.

### Step 2: The catch-up sheet stores the opt-outs

In `src/features/log-media/session/catch-up-log-sheet.tsx`, make the same
replacement for its `useState(targets)` line. Use the same three lines and the
same comment. Check that `ProviderId` is imported in this file (it is used in
the props type); add the type import from `@/lib/providers/types` only if it
is missing.

**Verify**: `bun typecheck && bun lint` → both exit 0. If lint reports a React
Compiler bailout (`shinobu/react-compiler-bailout`) on either component, STOP.

### Step 3: Full gates

**Verify**: `bun run test` → all pass.

### Step 4 (optional evidence): See it on a device

Only if a simulator with a signed-in AniList and Letterboxd account is
available. Otherwise skip and say so in your report.

1. Find an AniList anime film on a list or search wall. Do not open its
   details screen first (that warms the lookup).
2. Long-press the card and choose Log.
3. Expected: when the Letterboxd row appears in "Write to", it is checked.

## Test plan

- No new automated test. The repo does not test these sheet components, and
  the change is a derivation.
- `bun run test` must stay green.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0
- [ ] `grep -rn "useState(targets)" src/features` returns no matches
- [ ] `grep -rn "useEffect" src/features/log-media/log-confirm-sheet.tsx src/features/log-media/session/catch-up-log-sheet.tsx | wc -l` gives the same count as before your change (you added no effect)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- Either file sets the selection from a place this plan does not list (search
  each file for `setSelectedProviders`; expect the `useState` line, `retry()`
  in the confirm form, and the `onSelectedProvidersChange` prop in both).
- Lint reports a React Compiler bailout after the change.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This change hot reloads. No native rebuild.
- During a retry, a target that joins late is selected too. That is correct:
  it never received the first write.
- If a future change lets `targets` shrink while the sheet is open, the
  opt-out list keeps ids that are no longer targets. That is harmless, because
  the selection is always filtered from `targets`.
- A reviewer should check that no `useEffect` syncs targets into state and
  that `LogFormFields` props did not change.
