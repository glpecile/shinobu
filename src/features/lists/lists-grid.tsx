import type { ReactElement } from 'react';
import { RefreshControl, useWindowDimensions, View } from 'react-native';

import { List } from '@/components/List';
import { usePushRoute } from '@/lib/navigation';
import type { NormalizedMediaItem } from '@/types/media';
import { ListCard } from './list-card';

export function ListsGrid<T extends { id: string; title: string; owner: string; previews: NormalizedMediaItem[] }>({
  lists, href, count, noun = 'film', refreshing, onRefresh, onEndReached, footer,
}: {
  lists: T[];
  href: (list: T) => string;
  count: (list: T) => number | undefined;
  noun?: 'film' | 'item';
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached?: () => void;
  footer: ReactElement;
}) {
  const pushRoute = usePushRoute();
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.min(4, Math.floor(width / 264)));
  return (
    <List
      key={columns}
      className="flex-1"
      contentContainerStyle={{ padding: 10 }}
      data={lists}
      estimatedItemSize={204}
      keyExtractor={(list) => list.id}
      numColumns={columns}
      onEndReached={onEndReached}
      refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} />}
      renderItem={({ item }) => (
        <View className="px-1.5 mb-3"><ListCard count={count(item)} href={href(item)} list={item} noun={noun} onPress={() => pushRoute(href(item))} /></View>
      )}
      ListFooterComponent={footer}
    />
  );
}
