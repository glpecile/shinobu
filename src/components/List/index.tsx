import { LegendList, type LegendListProps } from '@legendapp/list/react-native';
import type { ReactElement } from 'react';

/**
 * The one allowed Legend List import in the app (AGENTS.md, .oxlintrc.json).
 * Screens never touch `@legendapp/list` directly; if web ever needs a different
 * virtualizer, swap in `components/List/index.web.tsx` without touching callers.
 */
export type ListProps<T> = LegendListProps<T>;

export function List<T>(props: ListProps<T>): ReactElement {
  return <LegendList {...props} />;
}
