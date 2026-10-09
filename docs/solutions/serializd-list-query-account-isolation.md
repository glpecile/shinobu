# Serializd list query account isolation

Serializd list queries keyed their cache by the supplied username but read the
current stored session independently when fetching. A query in the anonymous
bucket could therefore send a signed-in token and cache a private response.
An older account's query could likewise authenticate as a newly connected account.

Web hydration makes the anonymous mismatch reachable: `useConnectedProviders`
starts with an empty server snapshot while the client's token store can already
contain a session. A hook-level reproduction sent `Bearer tok` for a detail query
whose username was `null`.

List detail and index reads pass their captured query username to
`serializdDeps`. The session is included only when its username matches that
account; `null` means an anonymous read. A mismatch reads publicly rather than
sending another account's token, leaving private-access rejection to Serializd.
No-argument callers retain the current session for writes and progress reads.

`src/state/queries/serializd.test.ts` exercises the real suspense hooks and
outgoing Authorization headers for anonymous, mismatched, and matching accounts.
The anonymous detail and both mismatched reads failed before the guard. The
existing account-scoped cache lookup regression remains separate.

This is a JavaScript-only change and hot reloads; no native rebuild is needed.
