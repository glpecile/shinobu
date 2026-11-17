# Hardcover list scopes: what lists need and how the app tracks them

**Source:** `capability-scopes.json` and the OAuth pages in
`hardcoverapp/hardcover-docs`, read 2026-11-17 (issue #452). No request was
sent to Hardcover for this note.

## Findings

- **Every list read needs one of** `read:lists`, `read:lists:public`,
  `read:lists:private`, `read:lists:following`. **Every list write needs**
  `write:lists`. Shinobu requests `read:lists` and `write:lists`
  (`HARDCOVER_LIST_SCOPES` in `lib/providers/hardcover/config.ts`).
- **A request without a needed scope answers HTTP 403** with this body:

  ```json
  { "error": "insufficient_scope", "error_description": "...", "scope": "read:lists write:lists" }
  ```

  `scope` holds the missing scopes, space separated.
- **Other 403 causes use other `error` values:** `unsupported_operation`, and
  a burst-limit refusal. Only `insufficient_scope` says anything about scopes.
- **The app registration allows exactly the scopes the app requests.** A
  session from before this change was granted neither list scope, and a
  refresh grants nothing new.

## Consequences

- `ProviderSession.scopes` records what Hardcover granted:
  - A code exchange stores the response's `scope`. Without one it stores the
    requested set, which RFC 6749 section 5.1 says is the granted set.
  - A refresh stores the response's `scope`. Without one it keeps the previous
    session's set, so an old session never gains list scopes from a refresh.
  - A 403 `insufficient_scope` removes the scopes its body names from the
    stored session (`lib/providers/hardcover/http.ts`). Without a `scope` in
    the body it removes both list scopes.
- That 403 fails as a `ProviderNetworkError`, not a `ProviderAuthError`. An
  auth error starts a token refresh, and a refresh can't add a scope.
- An old session keeps its library and logging. It is never cleared or marked
  `reconnectNeeded`. `useHardcoverListsGranted` is false for it, and list
  surfaces show a reconnect prompt. A new connect grants the list scopes.

## Before this ships

The owner must add `read:lists` and `write:lists` to the app registration on
hardcover.app. Until then the authorize request asks for scopes the
registration does not allow.

## Still open, needs the first real connect

1. Whether the token response carries `scope`. The code works both ways.
