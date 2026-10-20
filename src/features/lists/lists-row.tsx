import { Text, useWindowDimensions, View } from 'react-native';

import { CollapsibleSection } from '@/components/collapsible-section';
import { ProviderIcon } from '@/components/provider-icon';
import { Rail, VirtualizedRail } from '@/components/rail';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { ViewAllLink } from '@/components/view-all-link';
import { usePushRoute } from '@/lib/navigation';
import type { LetterboxdListKind } from '@/lib/providers/letterboxd/lists';
import type { SerializdListKind } from '@/lib/providers/serializd/lists';
import { routes } from '@/lib/routes';
import { useLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { useSuspenseSerializdListsQuery } from '@/state/queries/serializd';
import { useHiddenLists, visibleByIds } from '@/state/prefs/hidden-items';
import { LIST_CARD_TEXT_HEIGHT, ListCard, NewListCard } from './list-card';
import { ListSheet, useListSheet } from './list-sheet';
import { letterboxdListSummary, serializdListSummary, type ListSummary } from './list-summary';
import { POSTER_STACK_RATIO } from './poster-stack';

const CARD_WIDTH = 240;

export function listsTitle(kind: LetterboxdListKind) {
  return kind === 'liked' ? 'Liked Lists' : 'Your Lists';
}

/** One card's stack, title, and meta; blocks in one card share a delay. */
export function ListCardSkeleton({ delay }: { delay: number }) {
  return (
    <View>
      <View style={{ aspectRatio: POSTER_STACK_RATIO }}><Skeleton className="w-full h-full rounded-md" delay={delay} /></View>
      <Skeleton className="h-4 w-3/4 rounded mt-2.5" delay={delay} />
      <Skeleton className="h-3 w-1/2 rounded mt-2" delay={delay} />
    </View>
  );
}

export function ListsRowSkeleton() {
  return (
    <View className="mb-6">
      <Skeleton className="h-7 w-40 rounded mx-4 mb-3" />
      <Rail className="px-4">
        {[0, 1, 2].map((index) => <View className="w-60 mr-4" key={index}><ListCardSkeleton delay={staggerDelay(index)} /></View>)}
      </Rail>
    </View>
  );
}

export function LetterboxdListsRow({ username, kind }: { username: string; kind: LetterboxdListKind }) {
  const pages = useLetterboxdListsQuery(username, kind);
  return <ListsRail indexHref={routes.letterboxdLists(kind)} kind={kind} lists={(pages.data?.pages[0]?.lists ?? []).map(letterboxdListSummary)} provider="letterboxd" />;
}

export function SerializdListsRow({ username, kind }: { username: string; kind: SerializdListKind }) {
  const pages = useSuspenseSerializdListsQuery(username, kind);
  return <ListsRail indexHref={routes.serializdLists(kind)} kind={kind} lists={pages.data.pages[0].lists.map(serializdListSummary)} provider="serializd" />;
}

type RailItem = ListSummary | { id: 'new' };

/** Your Lists leads with New list, so a member without lists still has the editor one tap away. */
function ListsRail({ lists: allLists, provider, kind, indexHref }: {
  lists: ListSummary[];
  provider: ListSummary['provider'];
  kind: 'created' | 'liked';
  indexHref: string;
}) {
  const pushRoute = usePushRoute();
  const { fontScale } = useWindowDimensions();
  const { openList, sheetProps } = useListSheet();
  const title = listsTitle(kind);
  const lists = visibleByIds(allLists, useHiddenLists(), (list) => [list.href]);
  // Gate on the unfiltered page: hiding page one must not cut off View all.
  if (allLists.length === 0 && kind === 'liked') return null;
  const items: RailItem[] = kind === 'created' ? [{ id: 'new' }, ...lists] : lists;
  return (
    <CollapsibleSection
      action={allLists.length > 0 ? <ViewAllLink onPress={() => pushRoute(indexHref)} title={title} /> : undefined}
      collapseKey={`${provider}-${kind}-lists`}
      leading={<ProviderIcon id={provider} size={16} />}
      title={title}
    >
      {items.length === 0 ? (
        <Text className="px-4 text-muted font-sans text-sm">All of these lists are hidden. Unhide them in Settings, or open View all.</Text>
      ) : <VirtualizedRail
        data={items}
        estimatedItemSize={CARD_WIDTH + 16}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<View className="w-4" />}
        ListFooterComponent={<View className="w-1" />}
        renderItem={({ item }) => (
          <View className="w-60 mr-4">
            {'title' in item
              ? <ListCard list={item} onActions={openList} onPress={() => pushRoute(item.href)} />
              : <NewListCard onPress={() => pushRoute(routes.newList(provider))} provider={provider} />}
          </View>
        )}
        style={{ height: CARD_WIDTH / POSTER_STACK_RATIO + LIST_CARD_TEXT_HEIGHT * fontScale }}
      />}
      <ListSheet {...sheetProps} />
    </CollapsibleSection>
  );
}
