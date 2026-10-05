# Android deep-navigation performance study

Status: findings-only checkpoint, stopped at the owner's request due to usage
budget. No production fix validated; deep-stack/Home comparison unfinished.

## Question and measurement target

Owner reports slowdown after Search → movie → actor → movie → Home, followed
by series scrolling. Web feels smoother. Compare the same Home gestures
before browsing and after returning from pushed routes. Treat a repeatable
change above 15% as a signal; do not claim improvement from one timing sample.

## Environment

- Pixel_9 ARM64 emulator, Android API 36; installed development client 0.5.2
  (versionCode 21), React Native 0.86.3 / Expo 57 / Hermes / New Architecture.
- React Compiler enabled in app configuration. The React report's global
  “not detected” warning contradicts its own per-component `[React Compiler]`
  annotations. This is not evidence to add manual memoization.
- Initial guest RAM: 2,531,868 KiB (~2.4 GiB); swap: 1,898,896 KiB.
- Existing iOS app shares Metro 8081. After Android restarted, Argent sometimes
  returned the iOS runtime even for an Android debugger request. No iOS runtime
  evaluation or profiling was performed. Android was moved to a dedicated
  Metro on 8082; runtime identity was checked before evaluation/profiling.
- The owner authorized a reboot with a temporary `-memory 6144` override,
  preserving app data. New guest `MemTotal`: 6,069,056 KiB. AVD configuration
  was not edited; no wipe, reinstall, dependency change, or native-source edit.

## Recorded evidence so far

### 1. Shallow Home baseline completed

Recorded and replayed `.argent/flows/android-home-scroll.yaml`: three vertical
flings down, three up, with a visible Continue Watching check before/after.
One uninterrupted replay passed (11.9 seconds). The raw gestures intentionally
preserve velocity/geometry for profiling, not element-seeking navigation.

React session `20261005-220012`:

| Metric | Result |
| --- | --- |
| Recording duration | 21.34 s |
| React commits | 21 |
| Captured fiber renders | 684 |
| Commits at least 16 ms | 4 |
| Slowest commit | 30.09 ms |

Slow work included `RefreshableScrollView`, catalogue rows, Legend List cells,
and gesture-backed cards. This run also triggered pull-to-refresh when the
return gestures reached the top: it is a scroll **plus refresh** workload,
not an isolated scroll-only benchmark. Live provider results can vary.

Native trace `native-profiler-20261005-215950.pftrace` reported 145 jank events.
These are not 145 independent ANRs and do not establish a production frame
rate. Prior carousel investigation already found similarly poor emulator/dev
drag timings across unchanged configurations:
[Android carousel investigation](../solutions/android-home-carousel-fling-remounts-every-card.md).

**Clock limitation:** the combined report showed a -114.7-second offset between
React and native starts, despite parallel start calls. Gesture timestamps minus
React `startedAtEpochMs` were outside the React recording window. Therefore
action annotations and hang↔commit wall-clock correlations are invalid in
this run. Do not interpret unmatched hangs as “pure native work.” Relative
React durations and independent native stack samples remain useful.

### 2. Deep browsing stalled under memory pressure

Search was initially blocked by an unresponsive dev-client/runtime. The owner
authorized a movie deep link instead. On dedicated Metro, the executed path
was Home → `shinobu://details/tmdb-movie-27205` (Inception) → Leonardo DiCaprio
→ *Learning, Studying… Always Perfecting: The Making of One Battle After Another*.
The second movie rendered its header/actions, but its credits remained loading.
UI-tree reads and JS evaluation then timed out; Back could not be verified.
This attempt did **not** complete the requested return-to-Home comparison.

At Inception, a read-only React fiber walk found:

| Metric | Result |
| --- | --- |
| Mounted fibers | 9,773 |
| `DetailsScreen` / `FeedScreen` instances | 1 / 1 |
| Mounted `PersonCard` instances | 35 |
| Cached queries / active queries | 57 / 18 |
| Query observers (including disabled observers) | 124 |

This is a single snapshot, not a leak trend or a before/after measurement.

While stalled at the second movie, `dumpsys meminfo --local` reported:

| App metric | KiB | MiB |
| --- | ---: | ---: |
| Total RSS | 477,476 | 466.3 |
| Total swap PSS | 764,042 | 746.1 |
| Native heap resident PSS | 165,424 | 161.5 |
| Native heap swap PSS | 647,349 | 632.2 |

The reported total PSS (1,159,263 KiB) includes swap in this output; do not
mislabel it as resident RAM. The regular non-local meminfo request timed out.
Guest `top` also showed `kswapd0` at 33% CPU, ~1.61 GiB of system swap used,
and the app at ~556 MiB RSS in that earlier snapshot. A later `/proc/meminfo`
snapshot had 520,480 KiB available and 1,528,276 KiB swap used.

Native trace `native-profiler-20261005-220414.pftrace`:

- Eight reported jank events, seven over 500 ms; longest 1,816 ms.
- JS-thread `queued_spin_lock_slowpath`: 600 ms / 60 samples / 14.05% of the
  sampled CPU weight. This is not a wall-clock blocked-time percentage.
- Drill-down recovered this actual caller chain (shortened):

  ```text
  mqt_v_js:
    RuntimeScheduler_Modern::performMicrotaskCheckpoint
      → JSI / memcpy / allocation
      → do_page_fault → handle_mm_fault → do_swap_page
      → swap_readpage → zram_submit_bio → zs_map_object
      → _raw_spin_lock → queued_spin_lock_slowpath
  ```

This is concrete evidence of compressed-swap page-in pressure on the JS thread,
not merely a generic “kernel overhead” hotspot. It explains stalls in this
**instrumented low-RAM emulator run**. It does not identify which allocations
caused the pressure, prove a leak, or establish the owner's physical-device
root cause. Debug bundle, profiling, retained screens, images, query data, and
the authenticated WebView all remain possible contributors.

### 3. Startup failure is separate evidence

`dumpsys activity lastanr` reported an input-dispatch timeout at 21:43:48,
before the browsing measurements. Do not conflate that pre-existing dev-client
ANR with the deep-navigation report. Failed recordings were archived outside
the repository; they are not passing QA flows.

## Source-level suspects (not yet causal findings)

1. **Eager credit rails.** `src/features/person/people-section.tsx` maps all
   credits into `src/components/rail.tsx`, a horizontal ScrollView. Inception
   mounted 35 cards although only a few fit onscreen. Each pushed movie retains
   those cards until popped. A virtualized horizontal list is an experiment
   worth measuring, not yet a validated fix.
2. **Retained observers during pushes.** `src/state/queries/resolve-item.ts`
   calls `useUnifiedFeed` on every details screen. Filmography cards subscribe
   to watched libraries. Query deduplication prevents duplicate fetches, not
   all observer work. Root Stack has no explicit freeze policy. Freezing alone
   does not unmount queries, release image memory, or prove a speedup.
3. **Long-lived in-memory metadata.** `src/state/queries/query-client.ts` uses
   24-hour `gcTime` globally. TMDB person/detail caches are not persisted but
   inherit that retention. `findInTmdbCache` flattens cached filmography rows
   during item resolution. Measure growth and resolution cost before changing
   the policy; persisted Home inputs intentionally need long retention.
4. **Hidden loading animations.** Credit fallbacks can mount 62 animated
   skeleton blocks while a request is pending. Scheduling cost behind a native
   stack has not been measured.
5. **Home itself.** Its vertical section tree and Continue Watching rail are
   eager; poster carousels and person filmography already use virtualized lists.
   Returning flings/pull-to-refresh and Home double-taps can refetch providers,
   independently of stack depth.

Native detail/person routes sit **above** `(tabs)`, hiding the native tab bar.
Returning with Back should pop screens, whereas pushing a Home route could
retain a different stack. The actual return mechanism must be recorded and
mounted-screen counts checked; a blanket “hidden details still render on Home”
claim is not yet justified.

## Higher-RAM control checkpoint

After the authorized reboot, the app eventually reached Home and answered JS
evaluation on dedicated Metro 8082. Startup still took multiple wait windows;
more RAM did not make this debug startup instant. No deep browsing was repeated
before the owner requested this checkpoint.

Before the higher-RAM Home profile:

| Metric | Result |
| --- | ---: |
| Mounted fibers | 6,464 |
| `FeedScreen` / `DetailsScreen` | 1 / 0 |
| Queries / active queries / observers | 35 / 10 / 79 |
| App RSS | 1,106,676 KiB (~1,080.7 MiB) |
| App swap PSS | 34,784 KiB (~34.0 MiB) |
| Native heap resident PSS | 628,426 KiB (~613.7 MiB) |

The dev app's footprint is already substantial on shallow Home. The smaller
swap count is consistent with the increased guest memory, but these are
different process/warm-up states, not an allocation-reduction result.

Replaying the unchanged Home flow passed again (17.1 s). React session
`20261005-222718` captured 683 fiber renders / 21 commits over 26.38 s, with
one commit ≥16 ms and a maximum of 21.53 ms. The slow batch followed the final
up gesture and involved Home sections/refresh, not hidden detail screens.
Native trace `native-profiler-20261005-222651.pftrace` reported 150 jank events,
all under 500 ms; the top sampled hotspot was emulator GPU transport `writel`
on RenderThread (36.37%). RSS rose from 1,038.7 to 1,069.8 MB during this trace
(tool-reported units), a weak signal rather than leak evidence.

Reboot also restored useful clock alignment: the combined report showed React
starting 0.1 s after native, and action annotations landed in the React window.
The first low-RAM run's invalid correlations remain invalid; do not repair
them retrospectively using the later offset.

**Conclusion:** compressed-swap pressure is confirmed in the stalled low-RAM
run. Eager cards, retained observers, and cache retention are plausible things
to measure next, not confirmed causes. There is no completed equal-state
before/after deep-stack comparison, no real-device release measurement, and no
measured code fix. The change in maximum React duration between these two
Home runs is not a claimed speedup.

## Next controlled measurements

1. Continue with the authorized 6 GiB emulator to test whether the route path
   completes without swap pressure. Keep the same app data and no code changes.
   Reboot/runtime warm-up is a confounder, so this is a memory-pressure control,
   not an app-performance before/after.
2. Record a complete movie → person → movie → Back-to-Home fragment, replacing
   recorder-selected image coordinates with verified text selectors. Gate each
   destination, preserve the authorized deep-link exception, and replay it.
3. Compare Home profiles at equal data/cache state; separate scrolling from
   refresh. Check screen instances, observer counts, resident/swap memory before,
   during, and after returning Home. Repeat at least twice.
4. Confirm on a physical Android release/profileable build before attributing
   emulator timings to the shipped app. Repair clock alignment before relying
   on combined-report action correlations.
5. Only then change the top measured offender and rerun the same workload.
   No dependency patch or speculative memoization is justified by current data.

## Checks and artifacts

- `bun lint`: passed before any changes.
- No app source/config/dependency changes so far; no native rebuild required.
- Raw profiles remain in local Argent artifact storage, not git. They may
  contain app/user data and are not attached publicly without sanitization.
- The replayable Home flow uses fixed Pixel 9 portrait geometry and requires
  a signed-in Home feed with Continue Watching. It is an investigation fragment,
  not a deterministic, account-independent regression test.

Replay after opening the app on Home, waiting for its feed, and ensuring no
detail routes remain:

```sh
argent flow run android-home-scroll --platform android --device emulator-5554
```

The flow can trigger pull-to-refresh and network reads; it never logs media or
changes tracker state. Failed deep-navigation takes are not committed as
passing flows. Next session should record a fresh complete path rather than
reconstructing those failed takes.
