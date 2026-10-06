# Defer unused native sheets

Status: experimental draft; Android validation blocked. Do not merge yet.

## Measured problem

The follow-up Android profile mounts ten closed sheets on Inception, including
`LogFormFields`, `TagPicker`, and the watchlist picker. None was opened. Closed
sheet content participates in mounting, query subscriptions, native layout and
portal updates. Two diagnostic dual-profile attempts hit UI-tree timeouts and
are not valid full-route performance baselines.

## Smallest experiment

In the shared native `Sheet`, defer its native host and content until the first
`open`. Retain that subtree thereafter: closing must still animate, and drafts
and measurement state must survive reopening. Do not change the web fallback,
providers, dependencies, query retention or navigation. JS-only; hot reload.

## Validation gate

- Compare mounted native sheet/content/fiber counts on the same warm routes.
- Replay movie → person → movie → Back → Home unchanged with dual profiling.
- Seek a repeatable >15% reduction in mounted work or render cost, disclose
  timing noise and native jank rather than inferring physical-device FPS.
- Open, cancel and reopen log/watchlist/credit sheets without tracker writes;
  confirm first-open content, closing and preserved local form state.
- Run repository checks and delegated ponytail review before shipping.

## Follow-up evidence (October 6 UTC)

- Existing 6 GiB Pixel_9, dedicated Metro 8082; React Compiler enabled. No
  rebuild, reinstall, data wipe, provider writes, or dependency changes.
- Initial dev-client launch repeated the previous study's `App react context
  shouldn't be created before` crash. Restarting the app and reopening its
  development URL recovered Home before profiling. This startup failure
  predates the experiment and is separate from the later Home-check failure.
- Baseline snapshot at Inception: ten `Sheet`, ten native `BottomSheet` and
  ten `SheetContent` instances; all ten `open` props were false. Log form,
  tags and watched-at field were mounted without opening any sheet.
- Diagnostic React sessions `20261006-010657` and `20261006-011029` captured
  21/42 commits. Native traces `20261006-010407`/`20261006-010830` reported
  519/19 jank intervals. This extreme variance and failed UI-tree checks make
  timing comparisons unsuitable. Combined-report clock offsets were -0.6/+0.4 s.
- After hot reload at Inception: 7,666 fibers, fourteen credit cards, ten
  lightweight `Sheet` wrappers, **zero** native `BottomSheet`/`SheetContent`,
  `LogFormFields`, `TagPicker` or `WatchedAtField` instances. This confirms
  deferral, not a measured navigation or FPS improvement. No matching baseline
  fiber count was captured in this pass.
- After scoped Android transport restart, the unchanged
  `android-virtualized-credits` replay reached Inception, the person page, the
  second movie and both intermediate Back destinations. The final Home
  Continue Watching check failed. Initial idle also reported residual motion;
  its following cast target checks passed. The replay is **not** a full pass.
- That after-change native trace is `20261006-011145`. React `Profiler.stop`
  timed out; status then reported `no_react_runtime`. Exclude this incomplete
  capture from before/after performance claims. The Android app process still
  existed; a bounded AndroidRuntime/ActivityManager/lmkd log read showed no
  crash attribution. Do not infer the cause of the Home-check failure.
- Lint, typecheck, class-name, guarded-navigation, links and diff checks passed;
  `bun run test`: 1,250 passed. Native first-open, content sizing, close/reopen,
  draft persistence and repeatable dual-profile comparisons remain unvalidated.
- Delegated read-only ponytail review: "Lean already. Ship." This is a
  complexity review, not device validation or permission to merge the draft.

Raw profiles remain in local Argent storage. Stop rather than weaken checks or
merge from a smaller tree alone. Resume with a recovered Android runtime (or a
physical Android profileable build), then complete the validation gate above.
