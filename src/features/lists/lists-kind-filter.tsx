import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { listsTitle } from './lists-row';

/** Both providers split their index into created and liked; one union covers both. */
export type ListsKind = 'created' | 'liked';

const KIND_OPTIONS = (['created', 'liked'] as const).map((value) => ({ value, label: listsTitle(value) }));

/**
 * The created/liked switch below the index header, so the other tab is one tap
 * away without going back. The choice lives in `?kind=`, like the watchlist's
 * provider filter, so it stays shareable and `setParams` swaps it without
 * pushing a new route. `action` sits at the row's end, as the layout toggle
 * does beside the anime seasons' format filter.
 */
export function ListsKindFilter({ kind, onChange, progress, action }: { kind: ListsKind; onChange: (kind: ListsKind) => void; progress: SharedValue<number>; action?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-3 px-6 pb-3">
      <NativeSegmentedControl accessibilityLabel="List type" className="flex-1 max-w-64" onChange={onChange} options={KIND_OPTIONS} progress={progress} size="md" value={kind} />
      {action != null && <View className="ms-auto shrink-0">{action}</View>}
    </View>
  );
}
