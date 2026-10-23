# Installed Nitro performance audit

Investigated on 2026-10-23 against Expo 58, React Native 0.88 and Worklets 0.13.0.
This is a source and dependency-contract investigation. No device latency or
renderer-memory improvement has been measured.

## Immediate fixes

- `lib/http/warm-connections.ts` called `prefetch(url)` without a key. Installed
  Nitro Fetch 1.8 rejects that call before native networking; the catch hid the
  failure. Supplying the required header restores the intended warmup. The
  regression runs the library's real request validation with a fake JSI boundary.
  With Simkl connected, native prefetch calls change from zero to two, including
  TMDB. This proves dispatch, not saved handshake time.
- `state/prefs/hidden-items.ts` invalidated both cached arrays on every MMKV
  preference event. Filter by the changed key and invalidate only the matching
  hidden-item or hidden-list snapshot.
- `state/prefs/collapsed-diary-days.ts` rebuilt its day set on every preference
  event. Ignore keys outside its prefix. Together these filters preserve snapshot
  identity when an unrelated section collapses, avoiding downstream refiltering.

All three fixes are JavaScript changes and hot reload. Storage keys and formats
stay compatible.

## Installed packages and update check

| Package | Installed | Latest stable checked | Decision |
| --- | --- | --- | --- |
| react-native-nitro-fetch | 1.8.0 | 1.9.0 | Next native upgrade candidate |
| react-native-mmkv | 4.3.2 | 4.3.2 | Current |
| react-native-nitro-modules | 0.37.1 | 0.37.1 | Current |
| nitro-webview | Git commit `275e9185` | npm 0.2.2 | Keep Git pin, which matches upstream main |

[Nitro Fetch 1.9.0](https://github.com/margelo/react-native-nitro-fetch/releases/tag/v1.9.0)
improves Android HTTP body reads, buffer allocation, UTF-8 decoding and Cronet
thread scheduling. Its peer requirements fit installed Nitro and Worklets. Its
advertised 30% improvement is for iOS WebSockets, which this app does not use.
The upgrade is not applied here; it requires `bun ios.clean` / `bun android.clean`
and a comparable native run with large Simkl/Diary responses.

Published WebView 0.2.2 targets an older React Native version. The
[pinned commit](https://github.com/l2hyunwoo/nitro-webview/commit/275e9185a7d969ec08e96368d3825db70e796acb)
contains the RN 0.88 migration and props initialization fix. Replacing the pin
with the npm release would undo that work.

## Opportunities worth measuring next

1. **Prefetch actual startup reads before JS boots.** Current registration warms
   unauthenticated host roots. Provider requests never consume those root bodies.
   Nitro Fetch supports registering a real read and consuming it with a matching
   `prefetchKey`. Start with one stable home request, such as Simkl's list read,
   instead of the whole fan-out. Keys must include account, request inputs and
   schema identity; registrations must update on token changes and disappear on
   disconnect. TanStack still owns the app cache and invalidation. Measure
   time-to-current-home-data and actual `nitroPrefetched` hits against root warming.
   See [upstream prefetch docs](https://github.com/margelo/react-native-nitro-fetch/blob/main/docs-website/docs/prefetch.md).

2. **Attribute response parsing and query snapshot work separately.** Nitro
   Fetch's `Response.json()` still calls `JSON.parse` on the calling JS runtime.
   MMKV makes storage fast, but `persist.ts` still serializes and restores the
   whole allowed query snapshot on JS, including the Set/Map codec. Existing
   persistence event filtering and first-page limits already remove unnecessary
   work. Remaining qualifying cache events each call `persistQueryClientSave`,
   which dehydrates synchronously before the persister's two-second throttle.
   A burst of successful queries can therefore build many snapshots before one
   write. Measure dehydration, parse, codec, hydrate and storage durations before
   changing the persistence architecture. Native buffers alone do not make JSON
   parsing native.

3. **Trial off-thread parsing only for a measured large response.** Installed
   Nitro Fetch exports `nitroFetchOnWorklet`, and installed Worklets supports its
   scheduling APIs. Its implementation uses synchronous networking on the worker
   and is not a drop-in replacement for our abortable Effect HTTP path. Any trial
   must preserve cancellation, status handling, retries and provider normalization,
   and account for the cost of transferring the result back to JS. Keep this work
   inside HTTP/provider boundaries, never in a component.

4. **Reduce WebView work after verifying authentication flows.** Sign-in listens
   to both `onLoadEnd` and settled navigation, although the installed native code
   emits them consecutively; removing the duplicate callback can avoid a second
   cookie read. The hidden Letterboxd write page also remains mounted after its
   receipt. Releasing it needs request ownership checks so a late receipt cannot
   tear down a newer write. Neither change is included without native sign-in and
   once-only write verification. The installed iOS implementation now dispatches
   imperative evaluation onto the main thread, so the older 0.1 crash workaround
   can be revisited in a measured follow-up.

## Avoid speculative changes

- Provider HTTP already uses Nitro Fetch through the shared client. Global fetch
  replacement adds no demonstrated benefit and would change SDK networking too.
- Tokens, preferences and the query cache already use separate MMKV instances.
  `compareBeforeSet` may help repeated equal writes, but query snapshots carry
  changing timestamps. It also does not suppress MMKV's JS change notifications;
  compare costs need measurement before enabling it globally.
- MMKV already installs memory-warning trimming. Do not add a periodic `trim()`.
- Nitro Modules is the native integration layer, not a switch that makes JS
  normalization, list rendering or JSON serialization run off-thread.
- WebSockets and Nitro Text Decoder are not installed. No dependency was added.

## Validation

The warmup regression failed before the fix with zero native prefetch calls and
passed after it with two. Preference regressions exercise mounted subscriptions,
checking stable snapshots for unrelated writes and updates for relevant removals.
Full repository checks are recorded in the accompanying task result.

`bun run test` passed 1,518 tests across 156 files. Typecheck, lint, class-name,
router-push and external-link guards passed, as did `git diff --check`. Lint
reported seven existing warnings outside the changed files. No device profiling,
native rebuild or dependency upgrade was performed.
