import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { View } from 'react-native';

import { Pager } from '@/components/pager';
import { ListsKindFilter, type ListsKind } from './lists-kind-filter';

const KINDS = ['created', 'liked'] as const;

/** The season pager's swipe/tap behavior, with shareable list-kind selection. */
export function ListsPager({ kind, renderKind }: {
  kind: ListsKind;
  renderKind: (kind: ListsKind) => ReactNode;
}) {
  const router = useRouter();
  const progress = useSharedValue(KINDS.indexOf(kind));
  const select = (next: ListsKind) => router.setParams({ kind: next });
  return (
    <View className="flex-1">
      <ListsKindFilter kind={kind} onChange={select} progress={progress} />
      <Pager onSettle={select} options={KINDS} progress={progress} renderPage={renderKind} value={kind} />
    </View>
  );
}
