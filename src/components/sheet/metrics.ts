/** What the sheet's scroller renders as, for a given measured content height. */
export interface SheetScrollMetrics {
  /**
   * Explicit height for the scroller — `undefined` only until the content has
   * been measured once. A `ScrollView` has no intrinsic height (it always
   * answers "as much as you have"), so without this the sheet's native
   * `'content'` detent would pin every sheet to the cap.
   */
  height: number | undefined;
  /**
   * False while the content fits. Not just an optimisation: an enabled scroller
   * swallows the drag that would otherwise move the sheet itself, so a short
   * sheet would stop being draggable-to-dismiss.
   */
  scrollEnabled: boolean;
}

/**
 * Sizes the sheet's scroller from its content: hug what's there, up to a cap,
 * and only scroll past it.
 *
 * Deliberately a *height*, not a `maxHeight`, and deliberately the shape of the
 * whole decision — the scroller is always in the tree, and this is the only
 * thing that changes about it. Choosing between a scroller and a plain `View`
 * instead (the previous shape) unmounts and remounts everything inside the
 * sheet, which turns any child whose own height depends on its own layout state
 * into an infinite loop: remount → child forgets it had collapsed → renders
 * tall → sheet swaps to the scroller → remount → …
 * (docs/solutions/sheet-scroller-swap-render-loop.md).
 */
export function sheetScrollMetrics(
  contentHeight: number | null,
  maxHeight: number,
): SheetScrollMetrics {
  if (contentHeight == null) return { height: undefined, scrollEnabled: false };
  return {
    height: Math.min(contentHeight, maxHeight),
    scrollEnabled: contentHeight > maxHeight,
  };
}
