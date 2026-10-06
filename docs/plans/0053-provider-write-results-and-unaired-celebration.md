# Provider write results and unaired celebration

## Scope

- Improve the shared write report used by logging, watchlist changes, and catch-up.
  Identify unsuccessful providers with their logo, name, status icon, and a
  separate reason card. Keep successful providers visible and preserve manual
  links and failed-only retries.
- An anime with zero known episodes is not complete. Only celebrate a rewatch
  when the episode is aired; an upcoming premiere keeps its countdown without
  the “watched every aired episode” copy.
- Restore Continue Watching and This Week rail gutters lost in PR #187, using
  the existing horizontal-list spacer pattern rather than CSS padding.

## Validation

Run the existing log/write tests and repository checks. Inspect the report with
mixed outcomes and the zero-progress upcoming anime state in the simulator,
without sending writes to real provider accounts. No native rebuild required.
