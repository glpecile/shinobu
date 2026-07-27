import { LegendList, type LegendListProps } from '@legendapp/list/react-native';
import type { ReactElement } from 'react';

/**
 * The one allowed Legend List import in the app (AGENTS.md, .oxlintrc.json).
 * Screens never touch `@legendapp/list` directly; if web ever needs a different
 * virtualizer, swap in `components/List/index.web.tsx` without touching callers.
 */
export type ListProps<T> = LegendListProps<T>;

/**
 * `recycleItems` is defaulted here rather than left unset: Legend List warns on
 * every mount when the prop is absent, and the app-wide answer is `false` —
 * rows like `MediaCard` keep local state (hover, quick-log) that would leak
 * into whichever row the cell got recycled to (AGENTS.md "Long Lists"). A list
 * whose rows are provably prop-derived can still opt in per call site.
 */
export function List<T>({
  recycleItems = false,
  ...props
}: ListProps<T>): ReactElement {
  return <LegendList {...props} recycleItems={recycleItems} />;
}
