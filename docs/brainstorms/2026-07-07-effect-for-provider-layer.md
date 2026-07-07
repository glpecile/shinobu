# Effect for the Provider Service Layer

**Status:** adopted (scoped experiment) — `effect` is installed, guardrails live in
`AGENTS.md` (Tech Stack), pilot is `todos/001` (Trakt).

## Why consider it at all

The hardest requirements in this app are all concentrated in `lib/providers/`, and
they map 1:1 onto what Effect is built for:

- **Fan-out with partial failure.** AGENTS.md mandates that `useLogMedia` surface
  *which* provider failed, never a collapsed boolean/throw.
  `Effect.all(writes, { mode: 'either', concurrency: 'unbounded' })` produces a
  per-provider `Either` structurally — no hand-rolled `Promise.allSettled` +
  index-to-provider bookkeeping. See `src/lib/providers/errors.test.ts` for the
  executable version of this pattern.
- **Typed provider errors.** `ProviderAuthError | ProviderRateLimitError | ...`
  (tagged errors, `src/lib/providers/errors.ts`) put "which provider failed and
  why" in the type signature instead of in discipline.
- **401 → refresh wrapper.** The AGENTS.md query convention ("wrap
  OAuth-token-bearing calls so a 401 triggers refresh before failing") is a
  composable `Effect.catchTag('ProviderAuthError', refreshThenRetryOnce)` written
  once per provider — not interceptor spaghetti.
- **Rate limiting / backoff.** plan.md Rule 101 (Trakt 5 req/s, throttled write
  queues) is `Effect.RateLimiter` + `Schedule.exponential` — the exact "network
  anomaly" classes the `docs/solutions/` loop anticipates.
- **Data contract enforcement.** Effect `Schema` at the network boundary turns
  "everything must decode into `NormalizedMediaItem`" from a convention into a
  decode step that fails loudly (as `ProviderDecodeError`) when a provider changes
  shape.

## Costs / risks

1. **Two runtimes.** TanStack Query is the mandated data-fetching engine; Effect
   has opinions about everything. Running both *fully* would compete. Mitigated by
   the containment rule below.
2. **Mental-model tax.** Generator syntax, layers, fibers — every contributor and
   every agent session has to speak it. Mitigated by documenting the idioms in
   AGENTS.md and keeping the surface area small (no Layers/Context DI until a real
   need appears).
3. **RN ecosystem path.** Effect core is pure TS and runs fine under Metro/Hermes,
   but fiber stack traces in an RN debugger are not lovely. Accepted as
   experiment risk.

## Decision: adopt, with hard containment

1. Effect lives **inside `lib/providers/` and `lib/http/` only**. Adapters and the
   fan-out orchestration are Effects internally.
2. The boundary is **`Effect.runPromise` inside TanStack Query's
   `queryFn`/`mutationFn`** (in `state/queries/*` / `features/*`). TanStack Query
   keeps caching, invalidation, and React state.
3. **No `Effect<...>` type ever appears in a component, screen, or hook
   signature.** No effect-rx / Effect-in-React runtime.
4. Rule 3 is what makes the experiment reversible: ripping Effect out means
   rewriting adapter internals only — zero screens or hooks touched.

## Pilot & exit criteria

Pilot on `todos/001` (Trakt): it exercises OAuth, refresh, read, write, and
normalization on a single provider before the fan-out (`todos/005`) commits to the
pattern. If, after Trakt lands, the error-handling/retry code is not clearly
better than the plain-Promise equivalent — or agents keep producing
mixed-paradigm code — revert per rule 4 and log the outcome in `docs/solutions/`.
