import { View } from 'react-native';

import { CollapsibleSection } from '@/components/collapsible-section';
import { ProviderIcon } from '@/components/provider-icon';
import { Rail, VirtualizedRail } from '@/components/rail';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { ViewAllLink } from '@/components/view-all-link';
import { usePushRoute } from '@/lib/navigation';
import type { LetterboxdListKind } from '@/lib/providers/letterboxd/lists';
import type { SerializdListKind } from '@/lib/providers/serializd/lists';
import type { NormalizedMediaItem } from '@/types/media';
import { routes } from '@/lib/routes';
import { useLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { useSuspenseSerializdListsQuery } from '@/state/queries/serializd';
import { ListCard } from './list-card';

export function listsTitle(kind: LetterboxdListKind) {
  return kind === 'liked' ? 'Liked Lists' : 'Your Lists';
}

export function ListsRowSkeleton() {
  return (
    <View className="mb-6">
      <Skeleton className="h-7 w-40 rounded mx-4 mb-3" />
      <Rail className="px-4">
        {[0, 1, 2].map((index) => <Skeleton className="w-60 h-44 rounded-lg mr-3" delay={staggerDelay(index)} key={index} />)}
      </Rail>
    </View>
  );
}

export function LetterboxdListsRow({ username, kind }: { username: string; kind: LetterboxdListKind }) {
  const pages = useLetterboxdListsQuery(username, kind);
  return <ListsRail count={(list) => list.filmCount} href={(list) => routes.letterboxdList(list.owner, list.slug)} indexHref={routes.letterboxdLists(kind)} kind={kind} lists={pages.data?.pages[0]?.lists ?? []} provider="letterboxd" />;
}

export function SerializdListsRow({ username, kind }: { username: string; kind: SerializdListKind }) {
  const pages = useSuspenseSerializdListsQuery(username, kind);
  return <ListsRail count={(list) => list.itemCount} href={(list) => routes.serializdList(list.id)} indexHref={routes.serializdLists(kind)} kind={kind} lists={pages.data.pages[0].lists} noun="item" provider="serializd" />;
}

function ListsRail<T extends { id: string; title: string; owner: string; previews: NormalizedMediaItem[] }>({
  lists, provider, kind, indexHref, href, count, noun = 'film',
}: {
  lists: T[];
  provider: 'letterboxd' | 'serializd';
  kind: 'created' | 'liked';
  indexHref: string;
  href: (list: T) => string;
  count: (list: T) => number | undefined;
  noun?: 'film' | 'item';
}) {
  const pushRoute = usePushRoute();
  const title = listsTitle(kind);
  if (lists.length === 0) return null;
  return (
    <CollapsibleSection
      action={<ViewAllLink onPress={() => pushRoute(indexHref)} title={title} />}
      collapseKey={`${provider}-${kind}-lists`}
      leading={<ProviderIcon id={provider} size={16} />}
      title={title}
    >
      <VirtualizedRail
        data={lists}
        estimatedItemSize={252}
        keyExtractor={(list) => list.id}
        ListHeaderComponent={<View className="w-4" />}
        ListFooterComponent={<View className="w-1" />}
        renderItem={({ item }) => (
          <View className="w-60 mr-3">
            <ListCard count={count(item)} href={href(item)} list={item} noun={noun} onPress={() => pushRoute(href(item))} provider={provider} />
          </View>
        )}
        style={{ height: 178 }}
      />
    </CollapsibleSection>
  );
}
