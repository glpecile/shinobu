import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
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
  const [visited, setVisited] = useState([kind]);
  if (!visited.includes(kind)) setVisited([...visited, kind]);
  const select = (next: ListsKind) => router.setParams({ kind: next });
  return (
    <View className="flex-1">
      <ListsKindFilter kind={kind} onChange={select} progress={progress} />
      {/* Defer untouched tabs to avoid concurrent Letterboxd reads, but retain
          visited walls so a swipe back preserves artwork and scroll position. */}
      <Pager onSettle={select} options={KINDS} progress={progress} renderPage={(pageKind) => pageKind === kind || visited.includes(pageKind) ? renderKind(pageKind) : null} value={kind} />
    </View>
  );
}
