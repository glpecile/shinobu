# Batch query persistence before dehydration

The provider currently builds a full TanStack snapshot for every eligible cache
event; the storage persister only throttles serialization and writes. Move the
existing two-second window to the provider subscription, keeping one timer from
the first event and reading the live cache when it expires. Set the storage
persister's throttle to zero so there is no second two-second delay.

Keep restoration, allowlisting, codecs, retention and first-page limits intact.
Cancel and flush pending work on subscription cleanup, after unsubscribing, so
removed queries stay removed and replacement/unmount cannot drop queued data.

Extend the existing mounted-provider test with twenty pre-seeded show-progress
refetch completions, counting snapshot saves and query-cache traversal visits
before source changes. Require one snapshot per window with latest data,
fetch-start/unpersisted-event filtering, removal before flush, and cleanup
flush/cancellation. Keep corrupt-restore coverage. Run the focused test, oxlint,
and typecheck. This is JS-only and hot reloads; no native rebuild is required.

## Measured result

Before production changes, the extended mounted-provider regression failed for
its intended reason: twenty completed show-progress refetches caused twenty
snapshot saves, twenty `getAll` traversals and 420 query visits. The cache holds
twenty persisted progress queries plus one deliberately unpersisted query.
After batching, the same completions cause one save, one traversal and 21
visits, a 95% reduction in snapshot/traversal work for this deterministic burst.
This counts work rather than measuring device frame time.

The regression now uses Bun's supported fake timers with the real storage
persister and MMKV substitute. At 1,999 ms there is no snapshot or traversal;
at 2,000 ms there is one, and the zero-delay disk write runs on the next timer
tick. An eligible removal at the end of the next window does not postpone its
flush. Pending removals flush on unmount and do not trigger a later duplicate.
Corrupt restoration and the existing serialization/allowlist coverage remain.
