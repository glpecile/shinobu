import {
  LegendList,
  type LegendListProps,
  type LegendListRef,
} from '@legendapp/list/react-native';
import type { ReactElement, Ref } from 'react';

/**
 * The one allowed Legend List import in the app (AGENTS.md, .oxlintrc.json).
 * Screens never touch `@legendapp/list` directly; if web ever needs a different
 * virtualizer, swap in `components/List/index.web.tsx` without touching callers.
 * `ref` is declared explicitly (React 19 delivers it in props, so the spread
 * already forwards it) — it reaches Legend List's imperative handle
 * (`scrollToOffset` and friends).
 */
export type ListProps<T> = LegendListProps<T> & { ref?: Ref<LegendListRef> };
export type { LegendListRef } from '@legendapp/list/react-native';

/**
 * `recycleItems` is defaulted here rather than left unset: Legend List warns on
 * every mount when the prop is absent, and the app-wide answer is `false` —
 * rows like `MediaCard` keep local state (hover, quick-log) that would leak
 * into whichever row the cell got recycled to (AGENTS.md "Long Lists"). A list
 * whose rows are provably prop-derived can still opt in per call site.
 *
 * `onStartReachedThreshold` is defaulted to 0 because Legend List ≥ 3.3.3 puts
 * `onStartReached` and `onEndReached` behind one shared "edge reached" gate
 * that closes as soon as *either* edge is hit — even with no `onStartReached`
 * handler. Every list mounts at the top, so the gate closed on mount and only
 * reopened while scrolled clear of both edges; a fast fling or scrollbar drag
 * straight to the bottom skipped that band and `onEndReached` never fired
 * (docs/solutions/legend-list-end-reached-never-fires-after-a-fast-scroll.md).
 * A zero threshold means the top edge is never "reached", so it never closes
 * the gate. Nothing in the app uses `onStartReached`; if one does, it must
 * pass its own threshold and re-verify the jump case.
 */
export function List<T>({
  recycleItems = false,
  onStartReachedThreshold = 0,
  ...props
}: ListProps<T>): ReactElement {
  return (
    <LegendList
      {...props}
      onStartReachedThreshold={onStartReachedThreshold}
      recycleItems={recycleItems}
    />
  );
}
