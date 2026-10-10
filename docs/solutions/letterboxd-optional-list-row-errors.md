# Optional Letterboxd list reads must not throw into React

The home feed's created/liked Letterboxd list rows already sit inside
`SuspenseSection`. A 502 was caught correctly by `SectionErrorBoundary`, but
React's development `onCaughtError` logs it through `console.error`, which Expo
LogBox turns into a prominent error overlay. Catching it again cannot silence
that development diagnostic. Do not filter console errors or globally ignore
LogBox messages.

The optional rows use a non-throwing TanStack infinite query instead. Absent
data renders no rail; cached lists remain visible if a background read fails.
The shared list options permit at most one retry, respecting the existing auth
and rate-limit exclusions. Pull-to-refresh can try again normally, and the
section boundary remains in place for unexpected render errors.

Explicit Letterboxd list indices and film pages also use non-throwing infinite
queries. While pending, their read hooks suspend on TanStack's
`prefetchInfiniteQuery`, whose promise resolves even on failure; the underlying
query retains its error. Once settled without data, the screen renders the
shared `ListsLoadError` notice with retry and a direct provider link. Cached
pages remain visible after a later-page or background failure. `ListsPage`
still catches unexpected render errors. A failed request never becomes a
fabricated successful empty page.

List HTTP failures retain their status. A 403, 404, or 502 receives no automatic
retry, and failed list reads do not retry on mount; the explicit retry action
can recover normally. Transient network failures still permit one retry.
