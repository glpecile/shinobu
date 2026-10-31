# Performance and motion review

Reviewed on 2026-10-31 against `dd6e6b9`. This is a whole-codebase audit with a
web focus. It records findings and implementation directions; it changes no
application behavior.

The highest-value performance follow-up is the unbounded Letterboxd read fan.
The clearest motion correction is honoring reduced motion for viewport jumps.
Most shared motion already follows the intended frequency and accessibility
rules. Two optional additions survive the opportunity filter.

## Scope and evidence

The source sweep covered app routes, shared components, feature screens,
provider and HTTP code, query/persistence/session state, Worker relays, build
configuration, assets, and existing performance and motion documentation.
Pattern searches located motion, scroll handlers, list renderers, timers,
subscriptions, query fans, and fetch sequencing; findings were checked against
their callers and shared owners. This does not mean every screen received
runtime QA.

The environment is Expo 58, React Native 0.88, React 19.3 with React Compiler,
Reanimated 4.7.1, Uniwind, Legend List 3.6, and TanStack Query 5. Existing Metro
and Worker servers were left running. Fresh production exports and an isolated
Chrome 156 profile supplied browser evidence through Argent. No user sessions
or provider writes were used.

Evidence labels below distinguish executable probes, browser observations,
source-confirmed behavior, and layout risks that still need reproduction.
There are no release-device frame-time, authenticated-list latency, field
Core Web Vitals, or before/after improvement claims.

## Performance findings

| ID | Priority | Location | Finding and evidence | Smallest next step |
| --- | --- | --- | --- | --- |
| PERF-1 | P2 | [media-progress.ts:50](../../src/state/queries/media-progress.ts#L50), [letterboxd-list-detail.tsx:43](../../src/features/lists/letterboxd-list-detail.tsx#L43) | Whole-list progress enables one Letterboxd watch query per loaded film, independently of visible rows. A deferred-transport probe using the actual hook and watch-query/provider path started 100 reads before any response returned. Missing identities can add a second query fan. | Bound Letterboxd public-read concurrency at the shared query/provider boundary, covering both identity and watch reads. |
| PERF-2 | P2 | [new-list-form.tsx:176](../../src/features/lists/new-list-form.tsx#L176), [new-list-form.tsx:232](../../src/features/lists/new-list-form.tsx#L232), [List/index.web.tsx:61](../../src/components/List/index.web.tsx#L61) | The selected-items list sits inside an outer scrolling form, has no bounded height, and passes `scrollEnabled={false}`. The web wrapper removes flex sizing for this case. Serializd accepts up to 500 selected shows. This is a virtualization risk from the layout configuration; a populated-form mount count was not measured. | Confirm at 500 items, then give the inner list a bounded viewport and scrolling if it expands to its full content height. Reuse the bounded preview pattern in Hidden Items. |
| PERF-3 | P2 | [poster-wall.tsx:275](../../src/features/feed/poster-wall.tsx#L275), [poster-wall.tsx:328](../../src/features/feed/poster-wall.tsx#L328), [poster-wall.tsx:336](../../src/features/feed/poster-wall.tsx#L336) | Reduced motion disables drift but still mounts the three repeated image strips used for seamless animation. A production Home at 1280 by 813 CSS pixels, with reduced motion verified, contained 234 wall image elements and zero running infinite animations. | Render a viewport-sized static strip with overscan when motion is reduced. Keep enough coverage for the tilt and negative offsets. |

All three are P2 follow-ups; none is a measured production outage.

### PERF-1. Bound the whole-list read fan

[LetterboxdListFilms](../../src/features/lists/letterboxd-list-detail.tsx#L40)
flattens all loaded pages and passes the complete collection to progress before
rendering the virtualized layout. [useItemProgress](../../src/state/queries/media-progress.ts#L47)
maps that collection to enabled queries. [letterboxdFilmWatchQuery](../../src/state/queries/letterboxd.ts#L305)
starts a public member-page read for each eligible film. [useMediaMetadata](../../src/state/queries/media-metadata.ts#L19)
can also resolve every missing film identity.

The isolated probe used 100 fabricated slug-bearing films, a fresh QueryClient,
Letterboxd as the only connected provider, and a fake transport whose responses
never resolved. Metadata resolution was bypassed to isolate watch reads. The
real hook, watch query, and provider implementation produced:

```json
{"itemCount":100,"started":100,"peak":100,"pendingQueries":100}
```

An independent replay returned the same counts. These are fetch invocations
and pending application promises. Browser connection pools may queue them;
this does not prove 100 upstream connections, rate limiting, or any particular
latency. No real HTTP request left the probe.

Keep per-film keys, account isolation, cache subscriptions, cancellation, and
positive-only watched evidence. Queue all needed reads so the whole-list
progress count eventually completes. Restricting reads to visible cells would
change that count's meaning. Do not replace the shared query cache or introduce
a second provider cache.

Extend the existing deferred-fetch patterns in
[media-progress.test.ts](../../src/state/queries/media-progress.test.ts). One
regression should saturate the bound, release responses, verify that queued
reads drain, and unmount while work remains. Preserve
[watched.test.ts](../../src/lib/providers/letterboxd/watched.test.ts) semantics.
Then compare the browser request waterfall for the same cold list and loaded
item count. Choose a concurrency limit from that evidence rather than claiming
one was established by this review.

### PERF-2. Verify the form's selected-items viewport

[Serializd's supported cap](../../src/lib/providers/serializd/lists.ts#L188)
is 500. [Form validation](../../src/features/lists/new-list-schema.ts#L47)
checks that cap on submit; it does not bound the list's rendered viewport.
Installed Legend List 3.6 explicitly diagnoses an outer height matching full
content height as disabling web virtualization.

Populate the form with 500 fixture shows without submitting it. Record the
selected-list viewport height, mounted row count, image count, and add/remove
interaction time. If the viewport grows with total content, follow
[HiddenItemsSection](../../src/features/settings/hidden-items-section.tsx#L106):
bound its height and let the list scroll. Preserve keyboard access, focus on
remove controls, and native nested scrolling. Existing schema tests cover
provider limits; this layout change needs rendered verification, not a
source-string test.

### PERF-3. Remove idle animation buffers under reduced motion

The production browser measurements were:

| Preference | CSS viewport | Wall images | Distinct wall URLs | Running infinite animations |
| --- | --- | ---: | ---: | ---: |
| Normal | 756 by 469 | 180 | 60 | 10 |
| Reduced | 1280 by 813 | 234 | 60 | 0 |

These are different viewport sizes, not an A/B performance comparison. The
source formula explains each image count:
`ceil(width * 1.5 / (tileWidth + gap)) * perColumn * 3`.
The pool currently contains 60 title images. Browsers share/cache repeated
URLs, so three image elements do not imply three network downloads.

For the static path, size the strip from viewport height plus tilt and offset
overscan. Simply replacing the three copies with one six-image set can expose
gaps on tall portrait screens. Verify short desktop, tall portrait, and studio
logo walls. Keep the animated path's documented seamless-loop buffers until a
separate measurement justifies changing them.

## Production web delivery baseline

A fresh static Home export at the reviewed commit references six unique
startup JavaScript files. Local gzip figures use Python `gzip.compress` with
its default level and a fixed timestamp. They are comparable artifact sizes,
not measurements of Cloudflare's wire encoding.

| Artifact | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| `__common-b63b6cd236d9ab13afff37f005d0c2aa.js` | 3,878,010 | 921,940 |
| `entry-9d9878e02aa54d3f5e22bc7f6641f6d2.js` | 1,274,241 | 326,381 |
| All six startup JS files | 5,205,729 | 1,266,420 |
| Five preloaded WOFF2 fonts | 349,432 | Not a useful recompression target |

Indexed source-map section spans attribute approximately 734 KB of generated
common-chunk characters to Effect, 671 KB to Reanimated, and 542 KB to Zod.
These are attribution hints, not compressed savings or unused-code counts.

Use the baseline to investigate import and route-loading boundaries before
proposing dependency changes. The recent font optimization and current font
readiness contract are intentional. This review does not recommend switching
off font gating, adding manual memoization, or enabling experimental bundler
flags without a separate measured comparison.

The unthrottled local run was useful for resource and DOM counts. Its buffered
LCP entry selected the splash image, so it is not an app-readiness benchmark.
No local timing is presented as real-phone or production-network performance.

## Motion review

The review follows [Emil Kowalski's purpose, frequency, and speed framework](https://emilkowal.ski/ui/you-dont-need-animations)
and the repo's shared motion tokens. The proposed corrections are separate
from optional additions.

| Before | After | Why |
| --- | --- | --- |
| **M1, P2.** [Home Back to top](../../src/app/(tabs)/index.tsx#L232) hard-codes `animated: true`; [Diary calendar selection](../../src/features/diary/diary-list.tsx#L790) omits `animated`. Installed Legend List defaults `scrollToIndex` to `animated = true` on native and web. | Read reduced motion in each owning component and pass `animated: !reduceMotion` to these intentional jumps. Match [Search's existing implementation](../../src/app/(tabs)/search.tsx#L565). | Source-confirmed viewport movement disregards the preference. This is independent of Reanimated's animation handling. Verify with populated Home and Diary, keyboard calendar selection, and reduced motion enabled. |
| **M2, P2.** [Letterboxd list cells](../../src/features/lists/letterboxd-list-detail.tsx#L75) and [Serializd list cells](../../src/features/lists/serializd-list-detail.tsx#L70) receive `LinearTransition` on web. | Gate this membership layout transition off web while keeping the reduced-motion guard on native. | A documented web layout hazard is reintroduced. Geometry changes scale text-bearing subtrees; [the existing solution](../solutions/reanimated-web-layout-transition-scales-text.md) explains why. Reproduce with wrapped title/subtitle or late metadata changing row height. A pure reorder of unchanged rectangles only translates; distortion was not observed during this audit. |
| **M3, P3.** [ViewAllLink](../../src/components/view-all-link.tsx#L24) accepts every pointer enter and nudges its chevron 3px over 160ms with built-in `ease-out`. | Gate hover motion to a hover-capable fine pointer and exclude touch events. Reuse `EASE_OUT`, `cubic-bezier(0.23, 1, 0.32, 1)`, for any retained 160ms nudge. | Source-confirmed missing hover guard can animate a touch tap as hover. [Tooltip](../../src/components/tooltip/index.web.tsx#L42) already rejects touch pointer entry. Reduced motion is correctly handled here. Verify mouse, touch, and keyboard focus without introducing movement on focus. |

Accessibility corrections take precedence. M2 is a source-confirmed use of a
known hazardous path, with its visible trigger still requiring reproduction.
M3 is lower-priority polish. Native disclosures, expandable text, and sheets
must reflow surrounding content; replacing their height changes with scale
would change behavior and is not recommended.

Motion verdict: **Block broad motion approval until M1 is corrected.** Existing
shared timing, reduced-motion press feedback, immediate tabs and keyboard
navigation, and opacity-only hover actions need no new animation. There is no
claim that unexercised gestures or native timing were approved.

## Animation opportunities

| # | Location | Today | Purpose | Frequency | Suggested motion |
| --- | --- | --- | --- | --- | --- |
| 1 | [PreviewPicker.Preview](../../src/features/settings/preview-picker.tsx#L80) | Selection swaps a border instantly; press feedback already exists. | State indication | Occasional Settings use | One noninteractive selection-border overlay, opacity `0` to `1`, `DURATION.color = 150ms`, `EASE_OUT = cubic-bezier(0.23, 1, 0.32, 1)`. Retarget the transition when selection reverses. Keep opacity-only feedback under reduced motion and make keyboard selection immediate. Apply once for Appearance and App icon. |
| 2 | [SettingsRail section toggle](../../src/features/settings/settings-rail.tsx#L96), [row visibility](../../src/features/settings/settings-rail.tsx#L310) | Rows mount/unmount immediately under an animated chevron. | Preventing a jarring change | Occasional disclosure | Lower-confidence option: reuse one group-level `SectionEnter` on reopen, opacity `0` to `1`, translateY `6` to `0`, `180ms`, `EASE_OUT = cubic-bezier(0.23, 1, 0.32, 1)`. Reduced motion keeps opacity only. Keyboard toggles remain immediate. Keep reflow immediate and avoid per-row entrances. |

Both recipes fit the speed budget and leave functional text in place. The
second survives only if a group wrapper fits the current composition without
restructuring Settings. Neither addition is required to repair the findings.
No hover effect is proposed.

Rejected additions:

- Core tabs, Search transitions, and sidebar shortcuts fail the frequency or
  keyboard gate. Preserve the removals documented in plan 0105.
- Virtualized media, Diary, and filmography rows fail the readability and
  remount gates. Preserve the explicit season-disclosure exception.
- Provider picker expansion, sheets, toasts, loading buttons, and counters
  already have a shared animation owner. Another reveal would duplicate it.
- Like celebrations fail the frequency gate. Selected state and press feedback
  already communicate the result.
- More onboarding or empty-state decoration fails the function gate. Home
  already has a hero entrance, stagger, and a moving poster wall.

The interface needs a few corrections and at most these small additions. The
shared preview selection edge has the best ratio of benefit to scope. Each
opportunity can become a separate implementation plan after selection, using
the exact values above and a rendered normal/reduced-motion feel check.

## Cleared paths and measurement follow-ups

Existing query persistence batches before dehydration, bounds persisted
infinite queries, and filters irrelevant events. Detail press prefetch and
current-item refresh scoping already avoid earlier waterfalls. RSS/page-one
reads share caches. Main media lists are virtualized, images use memory/disk
caching, and only Letterboxd images mount poster-recovery queries. Reviewed
timers and subscriptions clean up; Diary onboarding stops when unfocused,
reduced, or complete.

AniList schedule pagination, separate ani.zip identity/episode decoders,
mounted pager neighbors, and first-run Home's longer entrance are documented
tradeoffs. They are not fresh findings. No new proxy or provider cache is
proposed.

One CPU follow-up remains in [useItemProgress](../../src/state/queries/media-progress.ts#L51):
matching every loaded item against full provider libraries is multiplicative.
A synthetic unmatched-film probe exercised 250,000 predicates for 100 items
against a 2,500-film library, and 1,250,000 for 500. Profile that path with real
list and library sizes before adding indexes. Preserve the existing identity,
episode-numbering, and ambiguous-title tests. These operation counts do not
establish browser or native render cost.

Nested web blur and credit-refocus filtering were already recorded in plan
0081. They still need an attributable browser recording, rather than another
unmeasured recommendation to remove them.

## Validation and next order

- `bun lint` passed with no diagnostics.
- `bun run typecheck` passed.
- `bun run test` passed: 1,566 tests across 170 files, zero failures.
- Fresh production web export passed. Expo wrote the complete export, then
  reported that it forced its own process to exit.
- Production Chromium exercised anonymous Home, Search discovery and typed
  results, plus Home with forced reduced motion. The browser runtime log
  registry reported no application warnings or errors for the normal path.
- The 100-film deferred-transport probe passed its request-count assertions
  twice. No application tests, dependencies, native files, or configuration
  were added or changed.

Recommended order: fix M1, bound PERF-1, reproduce and address M2 and PERF-2,
then reduce PERF-3's static buffers. M3 and the two optional additions come after those.
Each implementation should validate its own affected path; the passing baseline
suite does not verify the proposed fixes.

Unverified paths include authenticated list rendering, the 500-item editor,
the list text-scaling trigger, touch hover behavior, live provider throttling,
iOS/Android runtime, tall reduced-motion walls, Safari, screen readers, and
release hardware. This documentation PR needs no hot reload or native rebuild;
the findings remain open for implementation.
