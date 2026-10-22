# Cache snapshots and item lookups

Skip persistence on fetch-start events, which change fetch status before any
new data arrives. Keep the existing allowlist and every other save event.

Replace flatten-before-find in the detail feed, search, diary, TMDB and seasonal
cache scans with ordered early returns. Preserve lookup precedence, media-type
matching and malformed-entry guards. Keep full-collection diary consumers intact.

Validate persistence through the mounted provider and real QueryClient events,
including completed refetches and removals. Extend existing cache lookup tests
for precedence and early return. Run the full suite and repository checks,
then correctness and complexity reviews before publishing and merging.

Compare snapshot counts for the same synthetic refetch workload. Host measurements
establish work reduction, not release-device latency or visible responsiveness.
