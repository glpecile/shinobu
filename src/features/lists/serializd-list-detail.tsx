import { RefreshControl, Text, View } from 'react-native';

import { ActionableRow } from '@/components/actionable-row';
import { CenteredNotice } from '@/components/centered-notice';
import Head from '@/components/head';
import { Image } from '@/components/image';
import { List } from '@/components/List';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { usePushRoute } from '@/lib/navigation';
import { type SerializdListEntry } from '@/lib/providers/serializd/lists';
import { routes } from '@/lib/routes';
import { useSuspenseSerializdListQuery } from '@/state/queries/serializd';
import { ListsHeader, ProviderListLink } from './list-header';

function entryRoute(entry: SerializdListEntry) {
  return entry.season != null && entry.episode != null
    ? routes.episode(entry.item.id, entry.season, entry.episode)
    : routes.details(entry.item.id, entry.item.type);
}

export function SerializdListItems({ username, id, url }: { username: string | null; id: string; url: string }) {
  const query = useSuspenseSerializdListQuery(username, id);
  const list = query.data;
  const pushRoute = usePushRoute();
  const { openActions, sheetProps } = useCardActions();
  return (
    <>
      <Head><title>{`${list.title} — Shinobu`}</title></Head>
      <ListsHeader provider="serializd" title={list.title} />
      <View className="flex-row items-center gap-3 px-6 pb-3">
        <Text className="font-sans text-muted text-sm flex-1 shrink" numberOfLines={2}>{`${list.itemCount} ${list.itemCount === 1 ? 'item' : 'items'} · by ${list.owner}`}</Text>
        <ProviderListLink iconOnly provider="serializd" url={url} />
      </View>
      <List
        className="flex-1"
        data={list.entries}
        estimatedItemSize={92}
        keyExtractor={(entry) => entry.id}
        refreshControl={<RefreshControl onRefresh={() => void query.refetch()} refreshing={query.isRefetching} />}
        renderItem={({ item: entry }) => (
          <ActionableRow
            accessibility={{ accessibilityLabel: `${entry.item.title}. ${entry.subtitle}`, accessibilityRole: 'button' }}
            className="px-6 py-2.5"
            href={entryRoute(entry)}
            item={entry.item}
            leading={
              <>
                {entry.item.coverImage === '' ? <PosterPlaceholder className="w-12 h-18 rounded" /> : <Image className="w-12 h-18 rounded" contentFit="cover" source={{ uri: entry.item.coverImage }} />}
                <View className="shrink ml-4">
                  <Text className="font-sans-semibold text-foreground text-base" numberOfLines={2}>{entry.item.title}</Text>
                  <Text className="font-sans text-muted text-xs mt-1" numberOfLines={2}>{entry.subtitle}</Text>
                </View>
              </>
            }
            onActions={openActions}
            onPress={() => pushRoute(entryRoute(entry))}
          />
        )}
        ListFooterComponent={!list.complete ? (
          <CenteredNotice>
            <CenteredNotice.Title>More items on Serializd</CenteredNotice.Title>
            <CenteredNotice.Body>{`Serializd returned ${list.entries.length} of ${list.itemCount} items. Open the original list to see the rest.`}</CenteredNotice.Body>
            <ProviderListLink provider="serializd" url={url} />
          </CenteredNotice>
        ) : undefined}
        ListEmptyComponent={list.complete ? (
          <CenteredNotice>
            <CenteredNotice.Title>This list is empty</CenteredNotice.Title>
            <CenteredNotice.Body>Items added on Serializd will appear here.</CenteredNotice.Body>
            <ProviderListLink provider="serializd" url={url} />
          </CenteredNotice>
        ) : undefined}
      />
      <CardActionsSheet {...sheetProps} />
    </>
  );
}

export function SerializdListSkeleton() {
  return (
    <>
      <ListsHeader provider="serializd" />
      <Skeleton className="h-4 w-40 mx-6 mb-6 rounded" />
      {[0, 1, 2, 3].map((index) => (
        <View className="flex-row items-center px-6 py-2.5 gap-4" key={index}>
          <Skeleton className="w-12 h-18 rounded" delay={staggerDelay(index)} />
          <View className="gap-2">
            <Skeleton className="h-5 w-40 rounded" delay={staggerDelay(index)} />
            <Skeleton className="h-3 w-24 rounded" delay={staggerDelay(index)} />
          </View>
        </View>
      ))}
    </>
  );
}
