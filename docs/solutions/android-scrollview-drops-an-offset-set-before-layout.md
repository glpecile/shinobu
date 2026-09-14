# The seasons pager sits on Winter while the strip reads Summer (Android, cold start)

## Symptom

(owner, 2026-09-12, Android.) On a cold session opening `/anime-seasons` showed
the season strip on the current cour (Summer) over a **blank** wall. Sliding
snapped back instead of paging, and the snap fired a fetch for Winter.

(owner, 2026-09-14.) Still broken on a **physical device running the v0.3.2
release** after the first fix below; never reproducible on the emulator's dev
client.

## Cause

`season-pager.tsx` puts itself on the selected cour with a non-animated
`scrollTo` once the pages mount. On Android that offset can be lost for good:

1. **View commands jump the mount queue.** `MountItemDispatcher` runs every
   pending view command *before* the pending mount items
   (`disableEarlyViewCommandExecution` defaults to false). A `scrollTo` issued
   while the commit that mounts the pages is still waiting for the UI thread
   executes first, against a content view with width 0.
2. **The parked offset is only re-applied from the scroll view's own
   `onLayout`.** `ReactHorizontalScrollView.setPendingContentOffsets` stores it,
   but Fabric's `updateLayout` only calls `layout()` on views whose frame
   changed. Mounting pages changes the *content container's* frame, not the
   scroll view's, so `onLayout` never runs again and the view stays at x = 0.
3. **No JS event fires after the mount.** `onLayout` / `onContentSizeChange`
   are emitted from `ShadowTree::commit`, before the UI thread mounts — so the
   first fix (re-assert from `onContentSizeChange`) hit the same race. A
   `contentOffset` prop does too: commits for one surface merge into a pending
   transaction, and within a batch props apply before layout.

It only reproduces where JS outruns the UI thread: a release build on a real
device. A dev client's slow JS lets the mount land first, so the emulator is
always fine.

Downstream, `progress` and `settled` said Summer, so the pager mounted pages
1–3 while the view sat on page 0 — the one page it doesn't mount. A drag that
snapped back ended momentum at x = 0 and `settleAt` reported Winter.

## Fix

`jumpTo` in `season-pager.tsx`, on Android, repeats the non-animated `scrollTo`
every frame until the scroll view's own `onScroll` reports the target offset
(`nativeX`, a shared value no jump writes). A landed `scrollTo` always emits a
scroll event (`OnScrollDispatchHelper` dispatches on any position change, and a
16ms `scrollEventThrottle` never throttles), a dropped one never does, so the
loop ends on the first frame after the mount. A settle more than one page from
the selected cour is still refused and jumped back, so the URL can't follow a
position nobody chose.

## Rule

On Android Fabric, an imperative scroll command is not ordered with the mount
that creates its content, and no JS-visible event marks that mount. Confirm a
programmatic offset from the scroll view's own scroll event; don't trust a
layout event to mean the native view is ready. Reproduce with a release build —
a dev client hides the race.
