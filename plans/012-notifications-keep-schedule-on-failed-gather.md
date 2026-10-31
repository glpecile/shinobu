# Plan 012: A failed gather never replaces the scheduled release notifications with nothing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/features/notifications/refresh.ts src/features/notifications/refresh.test.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plan 011 recommended first (it makes an all-failed Trakt leg visible as an error; without it that case still looks like "no shows")
- **Category**: bug
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

Release notifications are scheduled locally on iOS and Android, 7–14 days
ahead, and there is no push server (AGENTS.md "Notifications"). A refresh
gathers Up Next inputs, computes candidates and calls
`replaceScheduledNotifications`. That function cancels **every** scheduled
notification and schedules the new list, unless the content hash is unchanged.

When the device is offline during a background-task run, every provider leg
fails. The gather returns empty inputs plus `errors`, the candidate list is
empty, the hash changes, and **all pending notifications are cancelled**. They
come back only after the next successful refresh, which can be the next
WorkManager interval or a foreground plus the 15-minute throttle. Users miss
episode alerts because their phone was offline for a moment.

Plan 0020 R4 is deliberate: a broken provider must not stop the *other*
providers' notifications. Keep it. This plan adds one narrow rule: if the gather
reported errors **and** produced no candidates, keep the existing schedule.

## Current state

`src/features/notifications/refresh.ts`:

```ts
export async function refreshNotifications(
  deps: RefreshNotificationsDeps,
  options: RefreshOptions = {},
): Promise<void> {
  if (deps.isWeb()) return;
  if (!deps.isEnabled()) return;

  const applyThrottle = options.throttle ?? true;
  const nowMs = deps.now().getTime();
  if (applyThrottle) {
    if (deps.throttle.isThrottled(nowMs)) return;
    deps.throttle.record(nowMs);
  }

  // A disconnected/broken provider contributes zero inputs plus an error
  // entry (fetchUpNextInputs' own partial-failure contract) — never a
  // rejection, so the other provider's candidates still get scheduled (R4).
  const connected = deps.connectedProviders();
  const inputs = await deps.gatherInputs(connected);
  if (!deps.isEnabled()) return;
  const candidates = computeNotificationSchedule(inputs, deps.now(), deps.mutedKinds());
  await deps.schedule(candidates);
}
```

`UpNextInputs` (`src/features/up-next/types.ts`) has
`errors: Array<{ provider: ProviderId; message: string }>`.

Test harness (`src/features/notifications/refresh.test.ts`):
`makeDeps(overrides)` returns `{ deps, calls }`, where `calls.schedule` counts
schedule calls, and `EMPTY_INPUTS` is an `UpNextInputs` with all arrays empty.
Existing tests include `'turning alerts off while inputs load prevents scheduling'`.

## Commands you will need

| Purpose   | Command                                                   | Expected on success |
|-----------|-----------------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                           | exit 0              |
| Typecheck | `bun typecheck`                                           | exit 0              |
| One file  | `bun test src/features/notifications/refresh.test.ts`     | all pass            |
| All tests | `bun run test`                                            | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                                | exit 0              |

## Scope

**In scope**: `src/features/notifications/refresh.ts`, `src/features/notifications/refresh.test.ts`.

**Out of scope**: the scheduler (`scheduler/index.native.ts`), `compute-schedule.ts`,
and the throttle. Keeping per-provider "last good" candidates is a bigger design;
see maintenance notes.

## Git workflow

- Branch: `fix/notifications-failed-gather`
- One commit: `fix(notifications): keep the schedule when a failed gather yields nothing`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Guard the replace

After computing `candidates`, add:

```ts
  // Offline or every leg down: an empty list from a failed gather would cancel
  // every pending alert. Keep the last schedule; the next good refresh replaces it.
  if (inputs.errors.length > 0 && candidates.length === 0) return;
```

Leave the R4 comment above as it is (partial failures with candidates still schedule).

**Verify**: `bun typecheck` → exit 0.

### Step 2: Test

In `refresh.test.ts`, add one case in `describe('refreshNotifications')`:

```ts
  test('a gather that failed and found nothing keeps the existing schedule', async () => {
    const { deps, calls } = makeDeps({
      gatherInputs: async () => ({
        ...EMPTY_INPUTS,
        errors: [{ provider: 'trakt', message: 'offline' }],
      }),
    });

    await refreshNotifications(deps, { throttle: false });

    expect(calls.schedule).toBe(0);
  });
```

Also confirm that an existing test already covers "empty inputs, **no** errors
→ schedule is called" (that is how a user with nothing upcoming clears stale
alerts). Search the file for a test that uses `EMPTY_INPUTS` and asserts
`calls.schedule` is 1. If none exists, add that single case too, so both
sides of the new branch are pinned.

**Verify**: `bun test src/features/notifications/refresh.test.ts` → all pass.

## Test plan

- Errors plus no candidates → schedule not called (new).
- No errors plus no candidates → schedule called (existing, or new if missing).
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0
- [ ] `git diff --stat` shows only the two in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- `UpNextInputs.errors` no longer exists or has changed shape.
- `refreshNotifications` already returns early on errors (fixed independently).

## Maintenance notes

- Still open: a **partial** failure where the healthy legs do produce
  candidates. That replaces the schedule without the failed provider's alerts
  until the next good refresh. This is the R4 trade-off. A full fix stores the
  last good candidates per provider and merges them in for failed providers.
  Plan it only if users report missed alerts during single-provider outages.
- If the scheduler ever gains a "cancel only changed" diff, revisit this guard.
