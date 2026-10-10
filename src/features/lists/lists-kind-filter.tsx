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
 * pushing a new route.
 */
export function ListsKindFilter({ kind, onChange, progress }: { kind: ListsKind; onChange: (kind: ListsKind) => void; progress: SharedValue<number> }) {
  return (
    <View className="px-6 pb-3">
      <NativeSegmentedControl accessibilityLabel="List type" className="w-full max-w-64" onChange={onChange} options={KIND_OPTIONS} progress={progress} size="sm" value={kind} />
    </View>
  );
}
