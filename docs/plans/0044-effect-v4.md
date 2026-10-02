# Effect v4 migration

Upgrade the single Effect dependency to stable 4.0.0 without widening its
provider and HTTP boundaries or changing TanStack Query's ownership.

## Changes

- Replace removed combinators with their v4 equivalents: `catch`, `andThen`,
  and `result`. Convert `Either` consumers to `Result`, and unwrap the shared
  Trakt refresh with `Effect.fromResult`.
- Migrate the Trakt search and AniList GraphQL schemas. Preserve nullable
  optional metadata, required movie/show records, and typed decode failures.
- Update repository guidance to read the installed v4 documentation.

## Verification and landing

Run the full isolated Bun suite, typecheck, lint, class-name and navigation
checks, and production web and native bundles. Exercise provider reads,
search-to-details navigation, auth/decode errors, and write outcomes in browser
E2E checks. Use isolated browser fixtures for writes, never a real user's
history. Run live read-only smoke checks separately.

Open a Conventional Commits PR. Run `ponytail-merge` only after verification
passes, wait for CI, then return to `main` and pull.

## Results

- All 1,218 isolated tests pass, including refresh coalescing, cancellation,
  retry classification, provider writes, and nullable decode regressions.
- Typecheck, lint, class-name, router-push, external-link checks, frozen-lockfile
  installation, and production web/iOS/Android exports pass.
- Chromium E2E passes twice at desktop and phone widths. Intercepted APIs cover
  one shared refresh grant, nullable search metadata, search-to-details credits,
  failed writes with provider links, explicit retry, successful logs and watchlist
  writes, isolated decode failures, and failed/successful Serializd login with
  token validation. No real tracker writes or credentials are used.
- The production web build passes live read-only search, details, and TMDB
  credits checks without browser errors.

Cold search navigation produces React hydration warning 419 on both this branch
and an independently built, unchanged Effect v3 baseline at `3f21983`.
Navigating between mounted search routes can also issue duplicate searches on
both builds. These are pre-existing follow-ups, not changes in retry policy.
No additional browser runtime errors occurred. Native verification covers
Hermes exports, not device interaction, because Argent tools were unavailable.

This dependency is JavaScript-only. Existing dev clients can hot reload;
`bun ios.clean` and `bun android.clean` are unnecessary.
