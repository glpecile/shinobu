import { Text, View } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';

import { Button } from '@/components/button';
import { CollapsibleSection } from '@/components/collapsible-section';
import { ProviderIcon } from '@/components/provider-icon';
import { Rail, VirtualizedRail } from '@/components/rail';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { ViewAllLink } from '@/components/view-all-link';
import { usePushRoute } from '@/lib/navigation';
import type { HardcoverListKind } from '@/lib/providers/hardcover/lists';
import type { LetterboxdListKind } from '@/lib/providers/letterboxd/lists';
import type { SerializdListKind } from '@/lib/providers/serializd/lists';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { useSuspenseHardcoverListsQuery } from '@/state/queries/hardcover';
import { useSuspenseLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { useSuspenseSerializdListsQuery } from '@/state/queries/serializd';
import { useHiddenLists, visibleByIds } from '@/state/prefs/hidden-items';
import { useHardcoverListsPrompt } from './hardcover-lists-prompt';
import { LIST_CARD_TEXT_HEIGHT, ListCard, NewListCard } from './list-card';
import { ListSheet, useListSheet } from './list-sheet';
import {
  hardcoverListSummary,
  letterboxdListSummary,
  serializdListSummary,
  type ListSummary,
} from './list-summary';
import { POSTER_STACK_RATIO } from './poster-stack';

const CARD_WIDTH = 240;

const listsCollapseKey = (provider: ListSummary['provider'], kind: 'created' | 'liked') =>
  `${provider}-${kind}-lists`;

export function listsTitle(kind: LetterboxdListKind) {
  return kind === 'liked' ? 'Liked Lists' : 'Your Lists';
}

export function ListCardSkeleton({ delay }: { delay: number }) {
  const { fontScale } = useWindowDimensions();
  return (
    <View>
      <View style={{ aspectRatio: POSTER_STACK_RATIO }}>
        <Skeleton className="w-full h-full rounded-md" delay={delay} />
      </View>
      <View style={{ height: LIST_CARD_TEXT_HEIGHT * fontScale }}>
        <Skeleton className="h-4 w-3/4 rounded mt-2.5" delay={delay} />
        <Skeleton className="h-3 w-1/2 rounded mt-2" delay={delay} />
      </View>
    </View>
  );
}

export function ListsRowSkeleton({
  provider,
  kind,
}: {
  provider: ListSummary['provider'];
  kind: 'created' | 'liked';
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <CollapsibleSection
      action={<Skeleton className="h-4 w-16 rounded" />}
      collapseKey={listsCollapseKey(provider, kind)}
      leading={<ProviderIcon id={provider} size={16} />}
      title={listsTitle(kind)}
    >
      <Rail
        className="px-4"
        style={{ height: CARD_WIDTH / POSTER_STACK_RATIO + LIST_CARD_TEXT_HEIGHT * fontScale }}
      >
        {[0, 1, 2].map((index) => (
          <View className="w-60 mr-4" key={index}>
            <ListCardSkeleton delay={staggerDelay(index)} />
          </View>
        ))}
      </Rail>
    </CollapsibleSection>
  );
}

export function LetterboxdListsRow({
  username,
  kind,
}: {
  username: string;
  kind: LetterboxdListKind;
}) {
  const pages = useSuspenseLetterboxdListsQuery(username, kind);
  return (
    <ListsRail
      indexHref={routes.letterboxdLists(kind)}
      kind={kind}
      lists={(pages.data?.pages[0]?.lists ?? []).map(letterboxdListSummary)}
      provider={Provider.Letterboxd}
    />
  );
}

export function SerializdListsRow({
  username,
  kind,
}: {
  username: string;
  kind: SerializdListKind;
}) {
  const pages = useSuspenseSerializdListsQuery(username, kind);
  return (
    <ListsRail
      indexHref={routes.serializdLists(kind)}
      kind={kind}
      lists={pages.data.pages[0].lists.map(serializdListSummary)}
      provider={Provider.Serializd}
    />
  );
}

export function HardcoverListsRow({ kind }: { kind: HardcoverListKind }) {
  const lists = useSuspenseHardcoverListsQuery(kind);
  return (
    <ListsRail
      indexHref={routes.hardcoverLists(kind)}
      kind={kind}
      lists={lists.data.map(hardcoverListSummary)}
      provider={Provider.Hardcover}
    />
  );
}

export function HardcoverListsReconnectRow() {
  const pushRoute = usePushRoute();
  const prompt = useHardcoverListsPrompt();
  return (
    <CollapsibleSection
      collapseKey={listsCollapseKey(Provider.Hardcover, 'created')}
      leading={<ProviderIcon id={Provider.Hardcover} size={16} />}
      title={listsTitle('created')}
    >
      <View className="px-4 gap-3 items-start">
        <Text className="text-muted font-sans text-sm">{prompt.body}</Text>
        <Button
          icon={<Button.Icon name="link-outline" />}
          label="Reconnect Hardcover"
          onPress={() => pushRoute(routes.hardcoverLists('created'))}
          size="sm"
          variant="quiet"
        />
      </View>
    </CollapsibleSection>
  );
}

type RailItem = ListSummary | { id: 'new' };

function ListsRail({
  lists: allLists,
  provider,
  kind,
  indexHref,
}: {
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
  if (allLists.length === 0 && kind === 'liked') return null;
  const items: RailItem[] = kind === 'created' ? [{ id: 'new' }, ...lists] : lists;
  return (
    <CollapsibleSection
      action={
        allLists.length > 0 ? (
          <ViewAllLink onPress={() => pushRoute(indexHref)} title={title} />
        ) : undefined
      }
      collapseKey={listsCollapseKey(provider, kind)}
      leading={<ProviderIcon id={provider} size={16} />}
      title={title}
    >
      {items.length === 0 ? (
        <Text className="px-4 text-muted font-sans text-sm">
          All of these lists are hidden. Unhide them in Settings, or open View all.
        </Text>
      ) : (
        <VirtualizedRail
          data={items}
          estimatedItemSize={CARD_WIDTH + 16}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<View className="w-4" />}
          ListFooterComponent={<View className="w-1" />}
          renderItem={({ item }) => (
            <View className="w-60 mr-4">
              {'title' in item ? (
                <ListCard list={item} onActions={openList} onPress={() => pushRoute(item.href)} />
              ) : (
                <NewListCard
                  onPress={() => pushRoute(routes.newList(provider))}
                  provider={provider}
                />
              )}
            </View>
          )}
          style={{ height: CARD_WIDTH / POSTER_STACK_RATIO + LIST_CARD_TEXT_HEIGHT * fontScale }}
        />
      )}
      <ListSheet {...sheetProps} />
    </CollapsibleSection>
  );
}
