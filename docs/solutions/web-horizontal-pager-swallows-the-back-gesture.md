# A horizontal pager on web eats the browser's back gesture

**Symptom (2026-09-11).** Two-finger horizontal swipes over the seasons
explorer's wall never triggered the browser's back navigation, and a flick that
was not quite horizontal nudged the pager a few pixels before snapping back — a
wobble under the finger.

## Cause

`features/anime-seasons/season-pager.tsx` is a horizontal paging `ScrollView`.
On web that is a real scroll container, so every horizontal wheel/trackpad delta
over it is *its* scroll, never the page's — and the back gesture is the page's.

Trackpad paging had already been rejected (the browser free-scrolls for as long
as the OS sends momentum, so a flick lands anywhere), and the pager compensated
with a non-passive `wheel` listener:

```js
if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) event.preventDefault();
```

That made it worse. `preventDefault` on the container is exactly what suppresses
the back gesture, and the `deltaY` comparison leaks: a flick with any vertical
component runs the scroll, which `scroll-snap-type: x mandatory` then yanks back.

## Fix

Stop being a horizontal scroller on web. Web pages by tap anyway, and a tap
drives `scrollLeft` from a timing animation, which `overflow: hidden` still
allows:

```tsx
const webScrollLock = { overflowX: 'hidden' } as unknown as ViewStyle;
…
<AnimatedScrollView … style={isWeb ? webScrollLock : undefined} />
```

The wheel listener is gone. Native is untouched — the swipe there is the
platform's paging scroll view.

**Not `scrollEnabled={false}`**, the prop that looks right: react-native-web
implements it as `overflowX/Y: hidden` **plus `touch-action: none`**, and
effective `touch-action` propagates down the tree in Blink, so it would take
vertical touch scrolling of the wall inside it with it.

## Verifying

```js
getComputedStyle(pager).overflowX          // 'hidden'
pager.dispatchEvent(wheelEvent).defaultPrevented  // false → the page gets it
// tapping Fall: scrollLeft 2080 → 3120, so programmatic paging still works
```

## Related

- `season-switch-jank-remount-and-blur-on-native.md` — why the pager is a scroll
  view at all.
