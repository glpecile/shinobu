# A double tap pushes two detail screens

## Symptom

Quickly double-tapping a media card pushes `/details/[id]` onto the navigation
stack **twice**. Backing out of the details screen lands on an identical details
screen, and the user has to press back a second time.

This survived despite `components/presstable` already having a leading-edge
press debounce added for exactly this reason:

```ts
const PRESS_DEBOUNCE_MS = 500;

function useDebouncedPress(onPress) {
  const lastPressAtRef = useRef(0);
  return (...args) => {
    const now = Date.now();
    if (now - lastPressAtRef.current < PRESS_DEBOUNCE_MS) return;
    lastPressAtRef.current = now;
    onPress?.(...args);
  };
}
```

## Why the press debounce cannot fix this

It isn't broken. It is guarding the wrong thing.

`lastPressAtRef` is **per component instance**, which is right for "don't fire
this button's own action twice". The navigation stack is **global**, so a second
push can arrive without anyone pressing the same pressable twice:

- **Two instances of one item.** A show renders as a Continue Watching card
  *and* as today's cell in the Calendar strip (`up-next-section.tsx` feeds
  `calendarWeek` both sections), and a film can appear in more than one home
  carousel. Two components, two refs, one stack.
- **Stacked surfaces.** The card-actions sheet's "View details" sits directly
  over the card that opened it.
- **Remounts.** A remounted component starts with a fresh ref at `0`, so its
  next press is always "the first one". A Suspense refetch on a `SuspenseSection`
  row is enough to do that.

Investigation ruled out the usual suspects first, all of which were clean: no
raw `Pressable`/`Touchable`/`pressto` imports anywhere (the oxlint rule holds),
no `PressablesConfig` global handlers, and `recycleItems` is off on every list —
which matters here, because a recycled row would have leaked this exact ref
across items (AGENTS.md, "Long Lists").

## Fix

Guard the resource, not each of its callers. `src/lib/navigation/` adds a
module-scoped duplicate-push guard and a `usePushRoute()` hook that wraps
`router.push`:

```ts
const pushRoute = usePushRoute();
pushRoute(routes.details(item.id));
```

Module scope is load-bearing — a hook's ref would reset with the component that
held it, which is one of the holes being closed.

**Keyed on the href, not on "any push".** Blocking every push inside the window
would break legitimate fast navigation (tap a card, go back, tap a different
one) to fix a problem only repeats have. Two pushes of two different routes are
two intents; two pushes of one route inside 700ms never are. The window is
deliberately longer than the 500ms press debounce, because this is the backstop
for what that one structurally cannot catch.

A blocked push does **not** extend the window, or a finger resting on a card
could keep its route locked out indefinitely.

Repeat protection remains the default for actions such as the quick-log
checkmark and connect buttons. Disclosures must accept every press, so their
pressables use `pressBehavior="immediate"`. The shared wrapper's default
`pressBehavior="prevent-repeat"` drops repeats within 500 ms. The navigation
guard remains independent of that choice.

## Enforcement

`bun lint` runs `shinobu/no-unguarded-push` from
`oxlint-plugin-shinobu/rules/no-unguarded-push.ts`. It rejects bare
`router.push`/`router.navigate` outside `src/lib/navigation/`, including aliased
routers and destructured methods. This replaces the standalone regex script.

Navigation that genuinely isn't press-driven opts out with a
`// push-guard-exempt: <reason>` comment above the call. There are two, both
where a repeat is a real second intent: the notification tap
(`use-notification-tap-navigation`) and the ⌘K search shortcut
(`app-shell/index.web.tsx`).

## A stalled JS thread outlasts both windows (Android)

Both guards read `Date.now()` when the JS handler runs, not when the finger
touched. Rendering the first push's details screen can block the JS thread for
seconds on Android, and the second tap's press-in and press queue behind it.
Logging the root stack on an emulator showed the first push at 1.5 s, the
second tap's press-in preload at 2.3 s, and its push promoting that preload to
a second details route at 3.5 s. Each step was past both windows. On device it
read as the page sliding in twice with a gray frame between.

`usePushRoute` and `usePreloadRoute` now do nothing when the calling screen is
no longer focused (`navigation.isFocused()`). By the time a queued tap runs, the
first push has committed and its card's screen is covered. The time guard still
covers the gap before that commit. Focus is read imperatively, so cards don't
re-render on navigation.
