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
 * Keep the scroller mounted and only vary `height`/`scrollEnabled`; swapping
 * between a `ScrollView` and `View` remounts children and causes an infinite
 * layout loop (docs/solutions/sheet-scroller-swap-render-loop.md).
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
