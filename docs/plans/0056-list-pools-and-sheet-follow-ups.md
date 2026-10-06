# List pools and sheet follow-ups

Fold the owner's follow-ups into PR #190:

- Keep diary clusters flat: expanding a cluster inserts individual child rows,
  never a nested list or a mapped accordion body. Size its initial container
  pool for the 36px children rather than the 66px poster rows. Use a conservative
  episode-row estimate in the details list too; retain measured row heights.
- Give the shared write report one success card. Its headline already names
  providers, so remove the detached, redundant row of provider icons.
- Use the installed sheet library's Android `nativeOverlay` presentation. Its
  dialog owns system Back independently of the activity's native-stack callback
  order. Keep the existing controlled close request and leave iOS/web unchanged.

Run lint, typecheck, existing tests and repository checks. No new dependency,
native edit or dependency patch. JS-only: hot reload on the existing dev client.
Keep device checks limited; no profiling or speedup claim.

## Validation

Lint, typecheck, class-name/router/link checks and all 1,257 tests pass. The
limited Android check encountered a stale bundle (runtime sheet props lacked
`nativeOverlay`). Reloading then left the runtime unresponsive; both the restart
and relaunch failed. No passing gesture or warning-free expansion check is
claimed. Leave the merge pending Android Back verification on the updated bundle.
