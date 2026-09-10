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
- A POST that still bounces is re-queued once behind a fresh window; a second
  bounce rejects, which the fan-out reports as a Simkl failure with the link.

The chain's Simkl legs therefore resolve up to ~21s after their confirm, which
is why the catch-up sheet does not await each write (plan 0037 KTD-3): the
form advances immediately and a ledger reports each write as it lands, with a
one-line note that Simkl spaces its writes.

## Rule

Never fire a second Simkl `/sync/*` POST inside the window from anywhere — go
through the queue. Watchlist writes still bypass it (follow-up); the derived
post-log removal already filters Simkl out for this reason.
