# Diary query performance

Keep the unified infinite query, parallel provider reads, watermark ordering,
and partial-failure behavior. Independent provider requests already run together.

- Reuse in-flight pagination instead of cancelling and restarting on repeated
  end-of-list events.
- Share the username-scoped Letterboxd RSS query between the diary and film
  plays. Invalidate it before diary refresh and after logging; provider
  disconnect already purges the Letterboxd query root.
- Accumulate provider entries without copying all prior entries per page.

Verify request counts with deferred transports and real React Query hooks,
including refresh, log invalidation, and account separation. Run diary merge,
cursor, log invalidation, and disconnect tests, lint, and typecheck. These are
JS-only changes and hot reload. No measured device latency claim is intended.
