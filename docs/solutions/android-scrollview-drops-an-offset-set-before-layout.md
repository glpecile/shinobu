# The seasons pager sits on Winter while the strip reads Summer (Android, cold start)

## Symptom

(owner, 2026-09-12, Android, dev client.) On a cold session — app killed, no
React Query cache — opening `/anime-seasons` showed the season strip on the
current cour (Summer) over a **blank** wall. Sliding with a finger snapped back
instead of paging, and the snap fired a fetch, "often in the Winter position
(first one)". Warm sessions were fine.

## Cause

`season-pager.tsx` puts itself on the selected cour from a layout effect, right
after the commit that first mounts the four pages:

```tsx
scroller.current?.scrollTo({ x: index * size.width, animated: false });
```

The pages are mounted in that same commit, so on Android the command can reach
the view *before* the mount transaction gives its content a size. RN handles
that case — `ReactHorizontalScrollView.setPendingContentOffsets` parks the
offset and `onLayout` re-applies it — but only `if (isContentReady())`, which
means the content child already has a non-zero width **and** height. Miss that
window and the offset is silently dropped: `HorizontalScrollView` clamps to the
one page it can measure, which is page 0.

Everything downstream then disagreed with the scroll view. `progress` and
`settled` were set to the selected index, so the strip read Summer and the
pager mounted pages 1–3 — while the view sat at page 0, which is exactly the
one page it does *not* mount (`Math.abs(i - settled) <= 1 || i === index`).
Hence the blank wall. At offset 0 a finger cannot drag right at all; a drag
left that snaps back ends momentum at x = 0, and `settleAt` dutifully reported
"the user landed on Winter" and rewrote the URL, which is the fetch.

## Fix

Two parts, both in `season-pager.tsx`:

- **Re-assert the page when the content gets its size.** `onContentSizeChange`
  fires exactly when the pages have laid out, which is when a `scrollTo` can
  actually land. Content size changes on mount and on a resize, never
  mid-gesture, so this cannot fight a swipe.
- **Refuse a settle further than one page from the selected cour.** A swipe
  moves one page at most, so a rest two pages out is not a swipe — it is proof
  the scroll view is somewhere we never put it. Report nothing and jump back,
  so the URL can never follow a position the user didn't reach.

## Rule

An imperative `scrollTo` issued in the same commit that mounts the scrollable
content is a race on Android, and the platform's own safety net has a
precondition (`isContentReady`) that a just-mounted view can fail. Anything
that positions a scroll view declaratively from state needs a second,
layout-driven chance to re-apply — and any state derived from a scroll
position needs a sanity check against the intent, because a desynced scroll
view reports honest offsets for a page nobody chose.
