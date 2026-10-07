import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { CollapsibleSection } from '@/components/collapsible-section';
import { ProviderIcon } from '@/components/provider-icon';
import { Rail, VirtualizedRail } from '@/components/rail';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { usePushRoute } from '@/lib/navigation';
import type { LetterboxdListKind } from '@/lib/providers/letterboxd/lists';
import { routes } from '@/lib/routes';
import { useSuspenseLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { ListCard } from './list-card';

export function listsTitle(kind: LetterboxdListKind) {
  return kind === 'liked' ? 'Liked Lists' : 'Your Lists';
}

export function ListsRowSkeleton() {
  return (
    <View className="mb-6">
      <Skeleton className="h-7 w-40 rounded mx-4 mb-3" />
      <Rail className="px-4">
        {[0, 1, 2].map((index) => <Skeleton className="w-60 h-56 rounded-lg mr-3" delay={staggerDelay(index)} key={index} />)}
      </Rail>
    </View>
  );
}

export function LetterboxdListsRow({ username, kind }: { username: string; kind: LetterboxdListKind }) {
  const pages = useSuspenseLetterboxdListsQuery(username, kind);
  const pushRoute = usePushRoute();
  const lists = pages.data.pages[0].lists;
  const title = listsTitle(kind);
  return (
    <CollapsibleSection
      action={<Button accessibilityLabel={`View all in ${title}`} icon={<Button.Icon name="open-outline" />} label="View all" onPress={() => pushRoute(routes.letterboxdLists(kind))} variant="quiet" />}
      collapseKey={`letterboxd-${kind}-lists`}
      leading={<ProviderIcon id="letterboxd" size={16} />}
      title={title}
    >
      {lists.length === 0 ? (
        <Text className="font-sans text-muted text-sm px-4">
          {kind === 'liked' ? 'Lists you like on Letterboxd will appear here.' : 'Public lists you create on Letterboxd will appear here.'}
        </Text>
      ) : (
        <VirtualizedRail
          data={lists}
          estimatedItemSize={252}
          keyExtractor={(list) => list.id}
          ListHeaderComponent={<View className="w-4" />}
          ListFooterComponent={<View className="w-1" />}
          renderItem={({ item }) => (
            <View className="w-60 mr-3">
              <ListCard list={item} onPress={() => pushRoute(routes.letterboxdList(item.owner, item.slug))} />
            </View>
          )}
          style={{ height: 224 }}
        />
      )}
    </CollapsibleSection>
  );
}
