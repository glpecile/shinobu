import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { ActionableRow } from '@/components/actionable-row';
import { Button } from '@/components/button';
import { CenteredNotice } from '@/components/centered-notice';
import Head from '@/components/head';
import { Image } from '@/components/image';
import { List } from '@/components/List';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { MorphText } from '@/components/morph-text';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { ProgressRing } from '@/components/progress-ring';
import { RefreshControl } from '@/components/refresh-control';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { Tooltip } from '@/components/tooltip';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { MediaSortControl, SortingLoadedNotice } from '@/features/media-layout/media-sort-control';
import { MediaToolbar, MediaToolbarSkeleton } from '@/features/media-layout/media-toolbar';
import { sortMediaEntries } from '@/lib/media-sort';
import { usePushRoute } from '@/lib/navigation';
import { hardcoverListUrl, hardcoverListsUrl, type HardcoverListEntry } from '@/lib/providers/hardcover/lists';
import { HardcoverStatus } from '@/lib/providers/hardcover/reads';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import { useMediaSort } from '@/state/prefs/media-sort';
import { useSuspenseHardcoverListQuery } from '@/state/queries/hardcover';
import { DeleteList } from './delete-list';
import { ListsHeader, ProviderListLink, ToolbarIcon } from './list-header';
import { AddToList } from './list-membership-form';
import { RenameList } from './rename-list';

function subtitle(entry: HardcoverListEntry) {
  return entry.authors.length > 0 ? entry.authors.join(', ') : entry.item.year == null ? '' : String(entry.item.year);
}

/** `ListProgress` for books: the list read carries each book's status, so nothing loads or fails here. */
function ReadProgress({ entries, countLabel, partial }: { entries: readonly HardcoverListEntry[]; countLabel: string; partial: boolean }) {
  const read = entries.filter((entry) => entry.statusId === HardcoverStatus.Read).length;
  const reading = entries.filter((entry) => entry.statusId === HardcoverStatus.Reading).length;
  // Loaded books only: an unrequested next page is never counted as unread.
  const label = `${read} of ${entries.length}${partial ? ' loaded' : ''} read`;
  if (entries.length === 0) return <Text className="font-sans text-sm text-muted tabular-nums">{countLabel}</Text>;
  return (
    <Tooltip label={label}>
      <View accessible accessibilityLabel={`${label}${reading > 0 ? ` · ${reading} reading` : ''}`} className="flex-row items-center gap-2">
        <View className="size-5 items-center justify-center"><ProgressRing label={label} max={entries.length} value={read} /></View>
        <MorphText className="font-sans text-sm text-muted tabular-nums">{`${read}/${countLabel}`}</MorphText>
      </View>
    </Tooltip>
  );
}

export function HardcoverListItems({ id }: { id: number }) {
  const query = useSuspenseHardcoverListQuery(id);
  const { list, mine } = query.data.pages[0];
  const [actionEntry, setActionEntry] = useState<HardcoverListEntry | null>(null);
  const sort = useMediaSort('lists');
  const pushRoute = usePushRoute();
  const accent = useThemeColor('--color-accent');
  const { openActions, sheetProps } = useCardActions();
  // A book added between two page reads shifts the offsets, so a row can arrive twice.
  const entries = [...new Map(query.data.pages.flatMap((page) => page.entries).map((entry) => [entry.id, entry])).values()];
  const url = hardcoverListUrl(list.owner, list.slug) ?? hardcoverListsUrl(list.owner);
  const target = mine ? { provider: Provider.Hardcover, username: list.owner, id: list.id, title: list.title, url } : null;
  return (
    <>
      <Head><title>{`${list.title} — Shinobu`}</title></Head>
      <ListsHeader
        shareHref={routes.hardcoverList(list.id)}
        metadata={<ReadProgress countLabel={`${list.bookCount} ${list.bookCount === 1 ? 'book' : 'books'}`} entries={entries} partial={query.hasNextPage} />}
        provider={Provider.Hardcover} subtitle={`by ${list.owner}`} title={list.title}
      />
      <MediaToolbar notice={sort !== 'default' && query.hasNextPage ? <SortingLoadedNotice /> : undefined}>
        <MediaSortControl scope="lists" sort={sort} />
        {target != null && <RenameList description={list.description} key={list.title} target={target} />}
        {target != null && <DeleteList id={list.id} title={list.title} url={url} />}
        <ToolbarIcon><ProviderListLink iconOnly provider={Provider.Hardcover} url={url} /></ToolbarIcon>
      </MediaToolbar>
      {entries.length === 0 ? (
        <CenteredNotice>
          <CenteredNotice.Icon name="list-outline" />
          <CenteredNotice.Title>This list is empty</CenteredNotice.Title>
          <CenteredNotice.Body>{target != null ? 'Use the + button to add your first book.' : 'Books added to this list on Hardcover will appear here.'}</CenteredNotice.Body>
          <ProviderListLink provider={Provider.Hardcover} url={url} />
        </CenteredNotice>
      ) : (
        <List
          className="flex-1"
          data={sortMediaEntries(entries, sort)}
          // Four rows ahead and recycled, as the Serializd list.
          drawDistance={92 * 4}
          estimatedItemSize={92}
          recycleItems
          contentContainerStyle={{ paddingBottom: target != null ? 96 : undefined }}
          keyExtractor={(entry) => entry.id}
          onEndReached={query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError ? () => void query.fetchNextPage() : undefined}
          refreshControl={<RefreshControl onRefresh={query.refetch} />}
          renderItem={({ item: entry }) => {
            const read = entry.statusId === HardcoverStatus.Read;
            const rank = list.ranked && entry.position != null ? `${entry.position}. ` : '';
            return (
              <ActionableRow
                accessibility={{ accessibilityLabel: `${rank}${entry.item.title}. ${subtitle(entry)}${read ? '. Read' : ''}`, accessibilityRole: 'button' }}
                className="px-6 py-2.5"
                href={routes.details(entry.item.id, entry.item.type)}
                item={entry.item}
                leading={
                  <>
                    {list.ranked && <Text className="text-muted font-display text-base w-8 mr-3 text-right tabular-nums">{entry.position}</Text>}
                    {entry.item.coverImage === '' ? <PosterPlaceholder className="w-12 h-18 rounded" /> : <Image className="w-12 h-18 rounded" contentFit="cover" recyclingKey={entry.id} source={{ uri: entry.item.coverImage }} />}
                    <View className="shrink ml-4">
                      <Text className="font-sans-semibold text-foreground text-base" numberOfLines={2}>{entry.item.title}</Text>
                      <Text className="font-sans text-muted text-xs mt-1" numberOfLines={2}>{subtitle(entry)}</Text>
                    </View>
                  </>
                }
                onActions={(item) => { setActionEntry(entry); openActions(item); }}
                onPress={() => pushRoute(routes.details(entry.item.id, entry.item.type))}
                trailing={read ? <Ionicons color={accent} name="checkmark-circle" size={16} /> : undefined}
              />
            );
          }}
          ListFooterComponent={<LoadMoreFooter failed={query.isFetchNextPageError} loading={query.isFetchingNextPage} noun="books" onRetry={() => void query.fetchNextPage()} />}
        />
      )}
      <CardActionsSheet {...sheetProps} canHide={false} listRemoval={target == null || actionEntry == null ? null : { target, entryId: actionEntry.id, subtitle: subtitle(actionEntry) }} />
      {target != null && <AddToList items={entries.map((entry) => entry.item)} target={target} />}
    </>
  );
}

/** Reserves Rename's and Delete's slots: ownership is unknown until the list loads, and most lists opened are one's own. */
export function HardcoverListSkeleton({ shareHref }: { shareHref?: string }) {
  // Rename and Delete drop their labels on a phone (`RenameList`, `DeleteList`).
  const compact = useWindowDimensions().width < 640;
  const sort = useMediaSort('lists');
  return (
    <>
      <ListsHeader metadata={<Skeleton className="h-4 w-28 rounded-full" />} provider={Provider.Hardcover} shareHref={shareHref} subtitle="" />
      {compact ? <MediaToolbarSkeleton actions={3} scope="lists" /> : (
        <MediaToolbar>
          <MediaSortControl scope="lists" sort={sort} />
          <Button disabled icon={<Button.Icon name="create-outline" />} label="Rename" onPress={() => {}} size="sm" variant="quiet" />
          <Button disabled icon={<Button.Icon name="trash-outline" />} label="Delete" onPress={() => {}} size="sm" variant="quiet" />
          <View className="size-11 -mx-0.75 items-center justify-center"><Skeleton className="size-9.5 rounded-full" /></View>
        </MediaToolbar>
      )}
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
