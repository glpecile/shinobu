# Ghost taps while scrolling a list

## Symptom

Scrolling a Legend List (or any screen scroll view) on native opens a detail
screen or fires a row action nobody meant to press. It happens most when a
finger lands to stop a fling, or on a short drag that starts on a poster.

## Cause

Shared animated pressables use pressto, which renders gesture-handler's
`BaseButton`. Legend List and `RefreshableScrollView` scrolled with React
Native's own `ScrollView`, which gesture-handler doesn't track as a gesture.
Nothing told the button that the touch became, or ended, a scroll, so the lift
counted as a press. pressto's README calls this out ("Avoid highlight flicker
effect in Scrollable List").

## Fix

Scroll with gesture-handler's `ScrollView`. Its native gesture activates when
the drag becomes a scroll and cancels the button under the finger.

- `GestureScrollView` (`components/animated-view.tsx`) is gesture-handler's
  ScrollView through Reanimated, so worklet `onScroll` and `sharedValues`
  still work.
- `List` defaults `renderScrollComponent` to it.
- List callers also supply gesture-handler's `RefreshControl`, so its pull
  gesture blocks the scroll gesture while refresh activates.
- `RefreshableScrollView` uses it with gesture-handler's `RefreshControl`,
  which its ScrollView expects so the pull waits on the scroll gesture.

A new scroll surface whose rows are pressables uses `GestureScrollView`, not
`react-native`'s `ScrollView`.

## Pull-to-refresh on Android

A downward drag at the top of a list started a refresh and then fired the
button the drag started on, such as Add to watchlist or a diary day's
collapse chevron. Android's `SwipeRefreshLayout` takes the pull natively, so no
gesture-handler gesture activates to cancel the button. gesture-handler 3's
`BaseButton` presses on any lift that wasn't cancelled and reports
`pointerInside` to `onPress`, which pressto drops. `Presstable*` sets
`shouldCancelWhenOutside`, so a press that leaves the button's bounds cancels.
