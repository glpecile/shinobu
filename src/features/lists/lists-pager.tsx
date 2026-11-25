import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { View } from 'react-native';

import { Pager } from '@/components/pager';
import { ListsKindFilter, type ListsKind } from './lists-kind-filter';

const KINDS = ['created', 'liked'] as const;

export function ListsPager({ kind, renderKind, action }: {
  kind: ListsKind;
  action?: ReactNode;
  renderKind: (kind: ListsKind) => ReactNode;
}) {
  const router = useRouter();
  const progress = useSharedValue(KINDS.indexOf(kind));
  const [visited, setVisited] = useState([kind]);
  if (!visited.includes(kind)) setVisited([...visited, kind]);
  const select = (next: ListsKind) => router.setParams({ kind: next });
  return (
    <View className="flex-1">
      <ListsKindFilter action={action} kind={kind} onChange={select} progress={progress} />
      <Pager onSettle={select} options={KINDS} progress={progress} renderPage={(pageKind) => pageKind === kind || visited.includes(pageKind) ? renderKind(pageKind) : null} value={kind} />
    </View>
  );
}
