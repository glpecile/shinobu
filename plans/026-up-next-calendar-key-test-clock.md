# Plan 026: The Up Next calendar-key test uses a fixed clock instead of racing midnight

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/state/queries/up-next.test.ts`
> If it changed since this plan was written (plan 011 adds one test in another
> describe; that's fine), compare the excerpt below against the live test; on
> a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (test only)
- **Depends on**: none
- **Category**: tests (flake)
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

The test `'the calendar key carries the local start date and the 7-day window'`
lets the code read the clock, then computes its expected `YYYY-MM-DD` from a
**second** `new Date()`. A run that crosses local midnight between the two
reads fails. That's rare, but it lands in a timezone-sensitive area that
AGENTS.md says must stay tested, and CI machines run in arbitrary timezones.
Pinning the clock makes it deterministic.

## Current state

`src/state/queries/up-next.test.ts` (~line 368):

```ts
  test('the calendar key carries the local start date and the 7-day window', async () => {
    const { client, calendarKeys } = fakeClient({});

    await fetchUpNextInputs(client, ['trakt']);

    // Keyed by the local day so the cached week rolls over at local midnight
    // rather than serving yesterday's window to an app left open overnight.
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const key of calendarKeys) {
      expect(key[3]).toBe(expected);
      expect(key[4]).toBe(7);
    }
  });
```

The code under test calls `new Date()` (`src/state/queries/up-next.ts:~174`,
`traktCalendarRange({ days: UP_NEXT_WINDOW_DAYS }, new Date())`).

`bun:test` exports `setSystemTime(date?)`. Calling it with no argument restores the real clock.

## Commands you will need

| Purpose  | Command                                      | Expected on success |
|----------|----------------------------------------------|---------------------|
| Install  | `bun install --frozen-lockfile`              | exit 0              |
| One file | `bun test src/state/queries/up-next.test.ts` | all pass            |
| Lint     | `bun lint`                                   | exit 0              |

## Scope

**In scope**: that one test in `src/state/queries/up-next.test.ts`.

**Out of scope**: the `localDate(days)` helpers in
`src/features/watchlist-media/invalidate.test.ts` and `use-watchlist-media.test.ts`.
They build fixtures *relative* to now rather than comparing against a value the
code computed, so they don't race the same way. Leave them.

## Git workflow

- Branch: `test/up-next-fixed-clock`
- One commit: `test(up-next): pin the clock for the calendar-key test`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pin the clock

- Add `setSystemTime` to the existing `bun:test` import.
- In the test, before `fakeClient`, call
  `setSystemTime(new Date(2026, 6, 20, 12, 0, 0));` (local noon, 20 July 2026),
  and wrap the rest in `try { … } finally { setSystemTime(); }`.
- Replace the computed `expected` with the literal `'2026-07-20'`. Keep the comment.

**Verify**: `bun test src/state/queries/up-next.test.ts` → all pass.
Run it under two timezones: `TZ=Pacific/Kiritimati bun test src/state/queries/up-next.test.ts` and
`TZ=Pacific/Pago_Pago bun test src/state/queries/up-next.test.ts` → both pass.

## Test plan

- The existing test, made deterministic. No new tests.

## Done criteria

- [ ] Both TZ runs pass
- [ ] `bun lint` exits 0
- [ ] Only `up-next.test.ts` changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- Pinning the clock breaks other tests in the file (it shouldn't, because `finally` restores it).
- `setSystemTime` isn't exported by the installed `bun:test` version.

## Maintenance notes

- Use the same `setSystemTime` + `finally` pattern for any new test that compares against a clock-derived value.
