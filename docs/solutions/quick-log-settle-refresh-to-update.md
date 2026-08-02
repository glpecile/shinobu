# Quick-log "Logged — refresh to update" (stranded settle)

**Symptom (owner report 2026-08-02):** logging an episode from the Continue
Watching quick-log button showed "Logged — refresh to update." after ~10s
instead of the card advancing on its own.

## Two root causes

1. **Gate mismatch between advance and invalidate.** `resolveQuickLog`
   advances the card to `settling` when the entry's source provider succeeded
   **or was skipped** (reconcile: provider already records the watch). But
   `invalidateAfterLog` only invalidated `upNextQueryKeys.inputs()` for
   `succeeded` providers — an all-skip log fired no refetch at all, so the
   settle watcher waited on a refetch that never came and timed out.

2. **Passive settle observation with a hard timeout.** The button watched
   `useIsFetching` for the refetch, and declared `settle-failed` after 10s
   *even while a refetch was still in flight*. A post-write Simkl read can sit
   in the ~20s per-user write-lock/429-retry window
   (`docs/solutions/simkl-rate-limits-and-write-lock.md`), so a perfectly
   healthy slow refetch produced the failure UI — and then landed anyway,
   updating the screen right under the "refresh to update" notice.

## Fix

- `invalidateAfterLog` takes the skipped providers too and includes them in
  the Up Next gate. A reconcile-skip means the provider's state is *ahead* of
  the computed sections — exactly what a recompute exists for. Per-provider
  caches stay untouched on skips (reconcile just read them fresh).
- The quick-log button owns its settle signal: after a successful write it
  awaits `queryClient.invalidateQueries({queryKey: upNextQueryKeys.inputs()},
  {cancelRefetch: false})` — joining the mutation's in-flight refetch rather
  than restarting it — and returns to `idle` when the promise resolves (or is
  unmounted by the advancing data). The `settle-failed` phase, the
  `settleTransition` watcher, and `useUpNextSettling` are deleted; the 10s
  timer remains only as a spinner backstop that falls back to `idle`, never a
  "refresh to update" message.

## Rule of thumb

A UI that waits on "some query I invalidated elsewhere is refetching" via
`useIsFetching` is racy by construction (the fetch can start-and-finish
between renders, or outlive any fixed timeout). Await the `invalidateQueries`
promise from the component that needs the settle signal instead.
