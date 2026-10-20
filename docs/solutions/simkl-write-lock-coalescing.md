# Simkl's 20s write lock: coalesce, don't collide

**Symptom (2026-09-10, plan 0037).** Logging two episodes of one show within
twenty seconds — the whole point of the quick-log catch-up chain — failed the
second on Simkl alone with `400 rate_limit`. The same thing had always happened
to any two logs made close together (a film right after an episode).

## Cause

Simkl serialises `/sync/*` writes per user behind a ~20-second lock
(`simkl-rate-limits-and-write-lock.md`). `logToSimkl` already batches one
fan-out into one POST, but every *fan-out* was its own POST, and the global
retry predicate rightly refuses to retry a rate-limit error.

## Fix

`features/log-media/simkl-write-lock.ts`: one module-level queue every Simkl
history write goes through (`simklLogAdapter`'s default `log`).

- No lock engaged and nothing in flight → POST immediately.
- Otherwise the entry waits; when the lock lifts (21s after the previous POST
  *completed*), everything waiting goes as ONE POST and every waiter resolves
  with that POST's result. `logToSimkl` folds entries for the same item (same
  ids, same `watched_at`) into one `seasons[].episodes[]`.
- A POST that fails transiently is retried with a 2s → 4s → 8s → 16s backoff,
  five attempts in all, before the fan-out reports it as a Simkl failure.

## Long sessions still bounced (2026-10-20)

Logging DBZ episodes 52–85 one after another failed scattered episodes on
Simkl ("Episode 74 failed on Simkl") even though the queue waited 21s after
every landed POST. Simkl's current docs
(api.simkl.org/resources/rate-limits) say `400 RATE_LIMIT` means "your previous
write for this user is still running": the lock lasts as long as Simkl is still
processing the last write, so a large batch can hold it past our 21s. The docs
say to retry the lock shortly, never back off for minutes, and to retry
`429`/`500`/`502`/`503` with backoff, giving up after 5 attempts. The queue had
retried exactly once, so a second bounce surfaced as a failure.

The transport accepts both `RATE_LIMIT` and `rate_limit` for the 400 lock.
For 429 responses, `rate_limit` is a short burst, while `user_limit_exceeded`
and `app_limit_exceeded` are daily quotas. Simkl's `Retry-After` carries the
daily reset even on a burst response, so only non-burst responses retain it.
The queue fails those quota responses without replaying the write during its
short retry window, leaving the caller a manual retry link.

The chain's Simkl legs therefore resolve up to ~21s after their confirm, which
is why the catch-up sheet does not await each write (plan 0037 KTD-3): the
form advances immediately and a ledger reports each write as it lands, with a
one-line note that Simkl spaces its writes.

## Rule

Never fire a second Simkl `/sync/*` POST inside the window from anywhere — go
through the queue. Watchlist writes still bypass it (follow-up); the derived
post-log removal already filters Simkl out for this reason.
