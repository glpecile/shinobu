# Logging leaves the combined watchlist stale

## Cause

`invalidateAfterLog` refreshed Trakt, AniList, and Simkl provider entries but
not `watchlist/inputs`, the persisted gather used by the watchlist and its
membership indicators. Fresh combined inputs could retain pre-log membership
or status for the 15-minute stale window.

The derived film removal did not cover this: episode logs never run it, and a
film held only by Simkl deliberately produces no removal write because logging
already moves it out of `plantowatch`.

## Fix

After a successful Trakt, AniList, or Simkl log, invalidate the combined
watchlist after its provider entries. Keep Up Next invalidation last. Failed
writes and reconcile-only skips do not trigger this additional invalidation.
No new provider write or optimistic membership update is introduced.

`src/features/log-media/invalidate-after-log.test.ts` covers episode-log
invalidation, provider-before-gather ordering, and a Simkl-only film log using
a real QueryClient.
