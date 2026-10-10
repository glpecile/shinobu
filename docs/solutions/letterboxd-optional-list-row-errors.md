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

Explicit list pages retain their suspense queries and `ListsPage` error
boundary, retry action, and direct provider link. A genuine failed request
stays an error in the query cache, not a fabricated successful empty page.
