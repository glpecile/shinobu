# Disclosure list allocation needs a consistent render buffer

Legend List 3.6.0 sizes its initial container pool with a draw distance capped
at 50px. Once ready, its default draw distance grows to 250px. A collapsed
Details list can contain only a season header and its footer, so the initial
pool has no spare containers. Expanding a long season then needs more cells
for the larger buffer. `findAvailableContainers` warns before its caller grows
the pool.

Set `drawDistance={50}` on `DetailsList` to keep the initial and expanded
buffers consistent. Keep its 44px estimate and measured row heights; changing
the estimate alone did not eliminate the warning. Moving the footer out of
the data reduced demand by one cell but also did not eliminate it. The published
3.7.1 package retains this allocation mechanism, so an upgrade is not the fix.

On iPhone 17 Pro, a fresh Details list replayed 291 public TMDB episodes as one
season, with long episode titles. The original configuration warned on first
expansion (23 pooled containers, 25 needed). With the 50px buffer, first
expansion, three subsequent collapse/expand cycles, and fast scrolling to the
footer and back through the episodes produced no pool warnings. Inspected
screens contained the expected episode rows and footer. This was a native UI
replay, not a live AniList transport or provider-write test. AniList requests
timed out or returned a non-JSON response during this check.

Diary keeps its own 36px initial estimate for short episode-log children. Do
not silence warnings, mount an entire expanded body, or enable recycling for
stateful rows to hide a pool shortage. Preserve flat virtualization and inspect
the actual allocation path before changing an estimate.
