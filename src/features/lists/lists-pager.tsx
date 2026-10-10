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
      {/* Only the active tab renders: Letterboxd challenges datacenter reads
          (docs/solutions/letterboxd-public-list-pages.md), so mounting both
          tabs would double every visit into two concurrent upstream fetches
          and double the chance one lands challenged. A swipe settles onto a
          skeleton that fills in, instead of a preloaded wall. */}
      <Pager onSettle={select} options={KINDS} progress={progress} renderPage={(pageKind) => pageKind === kind ? renderKind(pageKind) : null} value={kind} />
    </View>
  );
}
