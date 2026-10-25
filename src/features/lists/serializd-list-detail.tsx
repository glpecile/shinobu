import { LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { RefreshControl } from 'react-native-gesture-handler';

import { ActionableRow } from '@/components/actionable-row';
import { CenteredNotice } from '@/components/centered-notice';
import Head from '@/components/head';
import { Image } from '@/components/image';
import { List } from '@/components/List';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { WatchedMark } from '@/components/watched-mark';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { MediaSortControl, SortingLoadedNotice } from '@/features/media-layout/media-sort-control';
import { MediaToolbar, MediaToolbarSkeleton } from '@/features/media-layout/media-toolbar';
import { DURATION } from '@/lib/motion';
import { sortMediaEntries } from '@/lib/media-sort';
import { useMediaSort } from '@/state/prefs/media-sort';
import { usePushRoute } from '@/lib/navigation';
import { applyPrimaryMetadata } from '@/lib/providers/merge-metadata';
import { type SerializdListEntry } from '@/lib/providers/serializd/lists';
import { routes } from '@/lib/routes';
import { useSuspenseSerializdListQuery } from '@/state/queries/serializd';
import { useMediaProgress } from '@/state/queries/media-progress';
import { AddToList } from './list-membership-form';
import { RenameList } from './rename-list';
import { ListsHeader, ProviderListLink, ToolbarIcon } from './list-header';
import { ListProgress } from './list-progress';

function entryRoute(entry: SerializdListEntry) {
  return entry.season != null && entry.episode != null
    ? routes.episode(entry.item.id, entry.season, entry.episode)
    : routes.details(entry.item.id, entry.item.type);
}

const membershipLayout = LinearTransition.duration(DURATION.swap);

export function SerializdListItems({ username, id, url }: { username: string | null; id: string; url: string }) {
  const query = useSuspenseSerializdListQuery(username, id);
  const list = query.data;
  const [actionEntry, setActionEntry] = useState<SerializdListEntry | null>(null);
  const target = username != null && username.toLowerCase() === list.owner.toLowerCase()
    ? { provider: 'serializd' as const, username, id, title: list.title, url } : null;
  const sort = useMediaSort('lists');
  const reducedMotion = useReducedMotion();
  const progress = useMediaProgress([...new Map(list.entries.map((entry) => [entry.item.id, entry.item])).values()]);
  const byId = new Map(progress.items.map((item, index) => [item.id, { item, state: progress.progress[index] }]));
  const entries = list.entries.map((entry) => ({ ...entry, item: applyPrimaryMetadata(entry.item, byId.get(entry.item.id)?.item), progress: byId.get(entry.item.id)?.state }));
  const pushRoute = usePushRoute();
  const { openActions, sheetProps } = useCardActions();
  return (
    <>
      <Head><title>{`${list.title} — Shinobu`}</title></Head>
      <ListsHeader
        shareHref={routes.serializdList(id)}
        metadata={<ListProgress countLabel={`${list.itemCount} ${list.itemCount === 1 ? 'item' : 'items'}`} partial={!list.complete} state={progress} />}
        provider="serializd" subtitle={`by ${list.owner}`} title={list.title}
      />
      <MediaToolbar notice={sort !== 'default' && !list.complete ? <SortingLoadedNotice /> : undefined}>
        <MediaSortControl scope="lists" sort={sort} />
        {target != null && <RenameList key={list.title} target={target} />}
        <ToolbarIcon><ProviderListLink iconOnly provider="serializd" url={url} /></ToolbarIcon>
      </MediaToolbar>
      <List
        className="flex-1"
        data={sortMediaEntries(entries, sort)}
        estimatedItemSize={92}
        itemLayoutAnimation={reducedMotion ? undefined : membershipLayout}
        contentContainerStyle={{ paddingBottom: target != null ? 96 : undefined }}
        keyExtractor={(entry) => entry.id}
        refreshControl={<RefreshControl onRefresh={() => void query.refetch()} refreshing={query.isRefetching} />}
        renderItem={({ item: entry }) => (
          <ActionableRow
            accessibility={{ accessibilityLabel: `${entry.item.title}. ${entry.subtitle}`, accessibilityRole: 'button' }}
            className="px-6 py-2.5"
            href={entryRoute(entry)}
            item={entry.item}
            showActions={target != null}
            leading={
              <>
                {entry.item.coverImage === '' ? <PosterPlaceholder className="w-12 h-18 rounded" /> : <Image className="w-12 h-18 rounded" contentFit="cover" source={{ uri: entry.item.coverImage }} />}
                <View className="shrink ml-4">
                  <Text className="font-sans-semibold text-foreground text-base" numberOfLines={2}>{entry.item.title}</Text>
                  <Text className="font-sans text-muted text-xs mt-1" numberOfLines={2}>{entry.subtitle}</Text>
                </View>
              </>
            }
            onActions={(item) => { setActionEntry(entry); openActions(item); }}
            onPress={() => pushRoute(entryRoute(entry))}
            trailing={<View className="flex-row items-center gap-2">{entry.progress != null && <WatchedMark item={entry.item} showProgress state={entry.progress} />}</View>}
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
            <CenteredNotice.Icon name="list-outline" />
            <CenteredNotice.Title>This list is empty</CenteredNotice.Title>
            <CenteredNotice.Body>{target != null ? 'Use the + button to add your first show.' : 'Items added on Serializd will appear here.'}</CenteredNotice.Body>
            <ProviderListLink provider="serializd" url={url} />
          </CenteredNotice>
        ) : undefined}
      />
      <CardActionsSheet {...sheetProps} canHide={false} listRemoval={target == null || actionEntry == null ? null : { target, entryId: actionEntry.id, subtitle: actionEntry.subtitle }} />
      {target != null && <AddToList items={entries.filter((entry) => entry.season == null && entry.episode == null).map((entry) => entry.item)} target={target} />}
    </>
  );
}

/** `signedIn` reserves Rename's slot: ownership is unknown until the list loads, and most lists opened are one's own. */
export function SerializdListSkeleton({ shareHref, signedIn }: { shareHref?: string; signedIn: boolean }) {
  // Rename drops its label on a phone (`RenameList`).
  const compact = useWindowDimensions().width < 640;
  return (
    <>
      <ListsHeader metadata={<Skeleton className="h-4 w-28 rounded-full" />} provider="serializd" shareHref={shareHref} subtitle="" />
      <MediaToolbarSkeleton actions={signedIn && compact ? 2 : 1} labelled={signedIn && !compact} scope="lists" />
      {[0, 1, 2, 3].map((index) => (
        <View className="flex-row items-center px-6 py-2.5 gap-4" key={index}>
          <Skeleton className="w-12 h-18 rounded" delay={staggerDelay(index)} />
          <View className="gap-2">
            <Skeleton className="h-5 w-40 rounded-full" delay={staggerDelay(index)} />
            <Skeleton className="h-3 w-24 rounded-full" delay={staggerDelay(index)} />
          </View>
        </View>
      ))}
    </>
  );
}
