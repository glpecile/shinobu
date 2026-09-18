# 0038 — Make the native episode swipe a paging scroll view

- **Status**: DONE
- **Commit**: 51561fa
- **Severity**: HIGH
- **Category**: Interruptibility (gesture handoff), Physicality
- **Estimated scope**: 7 files, ~150 lines net change, native screen rewritten around a pager

## Problem

On native, swiping between episodes is two animation systems glued together.
A Reanimated pan drags the page, and on release it freezes the page where the
finger left it and asks the JS thread for a `router.replace`. The native stack's
own replace transition then swaps screens.

```tsx
// src/features/episode-details/screen/index.tsx:101 — current
// On commit the offset stays where the finger left it: the replace
// animation takes over from there rather than from a snap back to 0.
if (committed) {
  scheduleOnRN(step, target);
  return;
}
```

A frame-by-frame capture on Android (Pixel 9 emulator, 10 fps strip) shows what
that feels like:

1. The page follows the finger, with an empty `bg-background` strip behind it.
   Nothing arrives from the other side, so the gesture explains nothing.
2. On release the page **stops dead for ~600 ms** at the release offset. The
   finger's velocity is thrown away at the exact moment the user is watching.
3. The stack transition then plays. Android's default is not horizontal, so a
   horizontal drag ends in a cut. iOS slides a new screen over a displaced one.
4. The new screen mounts, so `BlurEnter` fades the content in again.

`src/app/_layout.tsx:151-159` and `?dir=back` (`src/lib/routes.ts:12-30`) exist
only to pick push or pop for that replace.

The repo already ruled on this, in
`docs/solutions/season-switch-jank-remount-and-blur-on-native.md`:

> When the user moves between siblings of one collection, keep the siblings
> mounted and move between them.

## Target

The episode screen is a horizontal **native paging `ScrollView`**, like
`src/features/anime-seasons/season-pager.tsx`. The platform owns the gesture:
finger tracking, velocity, interruption, the snap, and the rubber-band at the
ends (iOS bounce, Android overscroll stretch). There is no custom pan, spring,
or threshold constant.

- Every episode of the sequence has a slot at `x = index * width`. Only the
  settled episode and its two neighbours are mounted. The rest of the sequence
  is two spacer `View`s, so a mounted page never changes position when the
  window moves and no offset correction is ever needed.
- A swipe lands, `onMomentumScrollEnd` reads the page, and the URL follows with
  `router.setParams({ season, number })`. It is the same screen instance, so
  there is no remount, no stack transition, and back still returns to the show.
- Previous / Next, the log button's auto-advance, and anything else calling
  `useGoToEpisode` scroll the pager (`scrollTo`, animated unless reduced
  motion) and set the params.
- Web is untouched: it keeps `router.replace` and the arrow keys.
- `?dir=back`, `EpisodeStepDirection`, and the `animationTypeForReplace`
  callback are deleted.

## Repo conventions to follow

- Exemplar: `src/features/anime-seasons/season-pager.tsx`. It uses
  `pagingEnabled`, takes `contentOffset` as a **prop** driven by a `settled`
  state (`docs/solutions/android-scrollview-drops-an-offset-set-before-layout.md`),
  gives pages an explicit `width`/`height`, mounts neighbours only at rest,
  uses the `BOUNDARY_TOLERANCE = 2` settle guard, and fires
  `haptics.selection()` on a landed swipe.
- No `useEffect` for sequencing (AGENTS.md "Effects and timers"). Nothing in
  this plan needs one.
- No `useMemo` or `useCallback` (React Compiler). Compose `className` with
  `cn()`. Use `@/` imports only.
- Comments go on functions and say how the thing is used. Do not describe the
  old implementation in comments.
- Shared step state goes through a context (AGENTS.md "Files and components").

## Steps

### 1. `src/features/episode-details/episode-neighbours.ts` — export the order

Split the ordered list out of `episodeNeighbours` so the pager can use it.
Behaviour of `episodeNeighbours` is unchanged. Do not touch its test.

```ts
/**
 * The sequence `season` belongs to, in the show's own layout, crossing season
 * boundaries (S1's last → S2's first). Specials (season 0) are their own
 * sequence: stepping back from S1E1 must not land on one.
 */
export function episodeOrder(
  seasons: readonly NormalizedSeason[],
  season: number,
): EpisodeRef[] {
  return [...seasons]
    .filter((entry) => (entry.number === 0) === (season === 0))
    .sort((a, b) => a.number - b.number)
    .flatMap((entry) =>
      [...entry.episodes]
        .sort((a, b) => a.number - b.number)
        .map((episode) => ({ season: entry.number, number: episode.number })),
    );
}
```

`episodeNeighbours` becomes `const ordered = episodeOrder(seasons, season);`
followed by its existing `findIndex` / `prev` / `next` body. Its docblock
shrinks to "The episodes either side of `{season, number}` in `episodeOrder`."

### 2. `src/features/episode-details/use-episode.ts` — expose order

Add to `EpisodeView`:

```ts
/** The sequence this episode sits in (`episodeOrder`); empty until the seasons list loads. */
order: EpisodeRef[];
/** The seasons list is still in flight, so `order` is not final. */
orderLoading: boolean;
```

In the returned object add
`order: seasons.data == null ? [] : episodeOrder(seasons.data, season),` and
`orderLoading: seasons.isLoading,`. Use `isLoading`, not `isPending`: the query
is disabled when there is no source and would stay pending forever. Import
`episodeOrder` beside `episodeNeighbours`.

### 3. `src/features/episode-details/episode-sections.tsx` — step through a context

Replace `useGoToEpisode` (currently lines ~262-279) with:

```tsx
/**
 * How the screen steps to a sibling episode. The native pager provides it and
 * scrolls there; without a provider (web) a step is a `replace`.
 */
export const EpisodeStep = createContext<((target: EpisodeRef) => void) | null>(null);

/**
 * Steps to a sibling episode: the nav buttons, the log button's advance and
 * the web arrow keys all call this. Never a push: stepping through episodes
 * must not stack one screen per step, so back still returns to the show.
 */
export function useGoToEpisode(id: string) {
  const router = useRouter();
  const step = use(EpisodeStep);
  // push-guard-exempt: `replace`, see above.
  return step ?? ((target: EpisodeRef) => router.replace(routes.episode(id, target.season, target.number)));
}
```

Import `createContext` and `use` from `react`. Update the caller in
`EpisodeNav` to `useGoToEpisode(id)`. `EpisodeNav` keeps its `season` and
`number` props only if something else in it uses them. If nothing does, remove
them from its props and from both screens' call sites.

### 4. `src/features/episode-details/episode-log-button.tsx` — use the hook

Line 84 currently inlines
`router.replace(routes.episode(item.id, next.season, next.number))`. Replace it
with `if (next != null) go(next);`, where `const go = useGoToEpisode(item.id);`
is declared beside the other hooks, **above** the early `return null`. Remove
the `useRouter` and `routes` imports if they are now unused. Reword the comment
above the call to `// Steps like `EpisodeNav`: back still returns to the show.`
Reword the `loggedCode` comment's "if `replace` reuses this instance" to
"between episodes".

### 5. `src/features/episode-details/screen/index.web.tsx`

Only the call changes: `useGoToEpisode(item.id, season, number)` →
`useGoToEpisode(item.id)`.

### 6. `src/lib/routes.ts` and `src/app/_layout.tsx` — delete `dir`

- `routes.ts`: delete the `EpisodeStepDirection` type and its docblock. Make
  `episode` three-argument again:
  ``episode: (id: string, season: number, number: number) => `/episode/${id}?season=${season}&number=${number}` as const,``
- `_layout.tsx:146-159`: replace the comment, the `options` callback, and the
  element with plain `<Stack.Screen name="episode/[id]" />`.

### 7. `src/features/episode-details/screen/index.tsx` — the pager

Remove the `react-native-gesture-handler` and `react-native-worklets` imports,
and `ReduceMotion`, `useAnimatedStyle`, `useSharedValue`, `withSpring`,
`useGoToEpisode`. Remove all six `SWIPE_*` / `BACK_GESTURE_EDGE_PX` /
`RUBBER_BAND` constants. Add `useRef` and `useState` from `react`,
`useReducedMotion` from `react-native-reanimated`, `useRouter` from
`expo-router`, and `EpisodeStep` from the sections module.

Target shape (the content JSX inside the page is the existing JSX, moved
verbatim):

```tsx
/** How far off a page boundary a resting offset may sit. */
const BOUNDARY_TOLERANCE = 2;

/**
 * Native (and the tsc default): a full-screen push shaped like the show's
 * own details screen — the still runs full-bleed under the status bar and
 * fades into the page, the heading sits over the fade, the back button floats.
 *
 * Episodes are horizontal pages of a native paging scroll view
 * (`features/anime-seasons/season-pager.tsx` is the pattern): the swipe, its
 * velocity and the rubber-band at either end are the platform's. Every episode
 * of the sequence owns the slot at `index * width`, but only the settled one
 * and its neighbours are mounted — the rest is two spacers, so a mounted page
 * never moves when the window does. The URL follows the pager with
 * `setParams`: one screen instance, so back still returns to the show.
 */
export function EpisodeScreen({ item, season, number, onBack }: EpisodeScreenProps) {
  const view = useEpisode(item, season, number);
  const router = useRouter();
  const scroller = useRef<ScrollView>(null);
  const reduceMotion = useReducedMotion();
  const window = useWindowDimensions();
  const { width } = window;
  // A horizontal scroll view does not stretch its pages' height on every platform.
  const [height, setHeight] = useState(window.height);
  const found = view.order.findIndex(
    (entry) => entry.season === season && entry.number === number,
  );
  const order = found === -1 ? [{ season, number }] : view.order;
  const index = Math.max(found, 0);
  // The page the scroll last rested on: what the mounted window is centred on
  // and where `contentOffset` points. Not `index` — that moves when a button
  // step starts, and a changed `contentOffset` would cut its scroll short.
  const [settled, setSettled] = useState(index);

  function commit(target: EpisodeRef) {
    router.setParams({ season: String(target.season), number: String(target.number) });
  }

  function settleAt(x: number) {
    const page = Math.round(x / width);
    if (Math.abs(x - page * width) > BOUNDARY_TOLERANCE) return;
    const landed = order[page];
    if (landed == null) return;
    setSettled(page);
    if (page === index) return;
    haptics.selection();
    commit(landed);
  }

  function step(target: EpisodeRef) {
    const page = order.findIndex(
      (entry) => entry.season === target.season && entry.number === target.number,
    );
    if (page === -1) return;
    scroller.current?.scrollTo({ x: page * width, animated: !reduceMotion });
    // A jump fires no momentum event.
    if (reduceMotion) setSettled(page);
    commit(target);
  }

  if ((view.episode == null && view.isLoading) || view.orderLoading) {
    return <EpisodeScreenSkeleton onBack={onBack} />;
  }

  const first = Math.max(Math.min(settled - 1, index), 0);
  const last = Math.min(Math.max(settled + 1, index), order.length - 1);

  return (
    <View
      className="flex-1 bg-background"
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
    >
      <EpisodeStep value={step}>
        <ScrollView
          contentOffset={{ x: settled * width, y: 0 }}
          horizontal
          onMomentumScrollEnd={(event) => settleAt(event.nativeEvent.contentOffset.x)}
          pagingEnabled
          ref={scroller}
          showsHorizontalScrollIndicator={false}
        >
          <View style={{ width: first * width }} />
          {order.slice(first, last + 1).map((entry) => (
            <View key={`${entry.season}-${entry.number}`} style={{ width, height }}>
              <EpisodePage item={item} number={entry.number} season={entry.season} />
            </View>
          ))}
          <View style={{ width: (order.length - 1 - last) * width }} />
        </ScrollView>
      </EpisodeStep>
      <FloatingBackButton onPress={onBack} />
    </View>
  );
}
```

`EpisodePage({ item, season, number })` is a new, unexported component in the
same file. It holds what the old `EpisodeScreen` body held: its own
`useEpisode` and `useEpisodeLogs` calls, the `useCSSVariable` background block
with its comment, `hero`, and the vertical `<ScrollView className="flex-1">` →
`<BlurEnter>` → content JSX, unchanged. There is no `GestureDetector` and no
`AnimatedView` wrapper. While its own view is loading
(`view.episode == null && view.isLoading`) it renders
`<EpisodeSkeletonBody />`. Docblock: "One episode's page: its own reads, so a
neighbour is complete before the swipe reveals it."

Split the skeleton. Move everything inside `EpisodeScreenSkeleton`'s
`AnimatedView` except the `FloatingBackButton` into an unexported
`EpisodeSkeletonBody()` that returns it in a fragment.
`EpisodeScreenSkeleton` renders `<EpisodeSkeletonBody />` plus the back button
inside the same `AnimatedView`, with its props and docblock unchanged.

If `setHeight` is called with an unchanged value React bails out, so no guard
is needed.

**The pager state must not exist while the order is loading.** `useState(index)`
reads its initial value once. If it runs on the render where `view.order` is
still empty, `settled` is 0 for good: the pager rests on the first episode and
mounts every page between it and the real one. So `EpisodeScreen` is only the
gate, and an unexported `EpisodePager` child owns everything after it:

```tsx
export function EpisodeScreen({ item, season, number, onBack }: EpisodeScreenProps) {
  const view = useEpisode(item, season, number);
  if ((view.episode == null && view.isLoading) || view.orderLoading) {
    return <EpisodeScreenSkeleton onBack={onBack} />;
  }
  return (
    <EpisodePager item={item} number={number} onBack={onBack} order={view.order} season={season} />
  );
}
```

`EpisodePager` takes `EpisodeScreenProps & { order: EpisodeRef[] }` and holds
the refs, `settled`, `commit`, `settleAt`, `step`, and the JSX shown above. It
derives `found` / `order` / `index` from its `order` prop instead of
`view.order`, and has no `useEpisode` call or loading gate of its own. The
long docblock stays on `EpisodeScreen`. `EpisodePager` gets one line: "Mounted
once the order is known, so `settled` starts on the opened episode."

## Boundaries

- Do NOT touch `screen/index.web.tsx` beyond step 5, nor any web behaviour.
- Do NOT add dependencies, a pager library, `FlatList`, or a `useEffect`.
- Do NOT edit `episode-neighbours.test.ts` or add tests. `episodeOrder` is
  pinned through `episodeNeighbours`' existing cases.
- Do NOT touch `android/` or `ios/`. This change is `src/` only and hot reloads.
- If a step doesn't match the code you find (drift since 51561fa), STOP and
  report instead of improvising.

## Verification

- **Mechanical**: `bun lint`, `bunx tsc --noEmit`, and
  `bun test src/features/episode-details` all pass. `bun check:router-push`
  passes. `grep -rn "dir=back\|EpisodeStepDirection\|animationTypeForReplace" src`
  returns nothing.
- **Feel check** (Android emulator and iOS simulator, a show with 3 or more episodes):
  - Drag slowly: the neighbouring episode's still and title slide in **under
    the finger**, edge to edge with the current page. No empty strip shows.
  - Release past half, or flick: the page carries the finger's velocity into
    the snap. No freeze, no fade, no second entrance on the landed page.
  - Catch the page mid-snap and reverse: it follows immediately.
  - At the first and last episode the platform's own overscroll answers.
  - Vertical scrolling inside a page still works, and a diagonal drag picks one axis.
  - Tap **Next** / **Previous**: the pager scrolls one page. Then swipe
    onward: the next neighbour must already be mounted. If it is blank on
    Android, programmatic scrolls are not firing `onMomentumScrollEnd` there.
    STOP and report.
  - Mark an episode watched: the sheet closes and the pager advances.
  - Back, after several steps, returns to the show in one press.
  - iOS: the left-edge back swipe still works on a middle episode.
  - With Reduce Motion on, Next/Previous jump without sliding. Swiping still tracks.
- **Done when**: all of the above hold and the before/after recordings show
  the freeze and the cut gone.
