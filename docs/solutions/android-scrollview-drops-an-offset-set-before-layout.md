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

Declare the offset, and create the scroll view together with its pages.

`SeasonPager` measures an outer `View` and only then renders the scroll view,
with its four pages and `contentOffset={{ x: settled * width }}`, in one commit.
Within a mount transaction the `Differentiator` emits a new subtree
bottom-up (creates, then the children's mutations, then this level's inserts),
so the content container is inserted and laid out *before* the scroll view's
own first `layout()`. The prop, applied at creation, parks the offset; that
first `onLayout` finds the content ready and applies it. No command, no retry.

`contentOffset` tracks where the pager *rests*, so it only changes where the
view already is (a swipe's momentum end, a jump) or on resize, and the prop
diff never sends it mid-gesture or mid-tap. react-native-web ignores the prop;
web keeps its layout-effect jump, which has no race there.

A settle more than one page from the selected cour is still refused and jumped
back, so the URL can't follow a position nobody chose.

## Rule

On Android Fabric, an imperative scroll command is not ordered with the mount
that creates its content, and no JS-visible event marks that mount. Put a
scroll view's resting offset in `contentOffset` and mount the scroll view in the
same commit as its content, rather than issuing `scrollTo` at a view that
already exists. Reproduce with a release build — a dev client hides the race.
