import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { RefreshControl, Text, View } from 'react-native';

import { ActionableRow } from '@/components/actionable-row';
import { Button } from '@/components/button';
import { CenteredNotice } from '@/components/centered-notice';
import Head from '@/components/head';
import { Image } from '@/components/image';
import { List } from '@/components/List';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { usePushRoute } from '@/lib/navigation';
import { serializdListsUrl, serializdListUrl, type SerializdListEntry, type SerializdListKind } from '@/lib/providers/serializd/lists';
import { routes } from '@/lib/routes';
import { useSuspenseSerializdListQuery, useSuspenseSerializdListsQuery } from '@/state/queries/serializd';
import { useConnectedProviders } from '@/state/session';
import { getSerializdUsername } from '@/state/session/serializd';
import { ListsGrid } from './lists-grid';
import { ListsHeader, ProviderListLink } from './list-header';
import { listsTitle, ListsRowSkeleton } from './lists-row';

function SerializdListsIndex({ username, kind, url }: { username: string; kind: SerializdListKind; url: string }) {
  const pages = useSuspenseSerializdListsQuery(username, kind);
  const lists = [...new Map(pages.data.pages.flatMap((page) => page.lists).map((list) => [list.id, list])).values()];
  if (lists.length === 0) return (
    <CenteredNotice>
      <CenteredNotice.Title>No lists yet</CenteredNotice.Title>
      <CenteredNotice.Body>{kind === 'liked' ? 'Like a list on Serializd to see it here.' : 'Create a list on Serializd to see it here.'}</CenteredNotice.Body>
      <ProviderListLink provider="serializd" url={url} />
    </CenteredNotice>
  );
  return (
    <ListsGrid
      count={(list) => list.itemCount}
      href={(list) => routes.serializdList(list.id)}
      lists={lists}
      noun="item"
      onEndReached={pages.hasNextPage && !pages.isFetchingNextPage && !pages.isFetchNextPageError ? () => void pages.fetchNextPage() : undefined}
      onRefresh={() => void pages.refetch()}
      refreshing={pages.isRefetching}
      footer={
        <View className="items-center gap-3 pb-6">
          <LoadMoreFooter failed={pages.isFetchNextPageError} loading={pages.isFetchingNextPage} noun="lists" onRetry={() => void pages.fetchNextPage()} />
          <ProviderListLink provider="serializd" url={url} />
        </View>
      }
    />
  );
}

function entryRoute(entry: SerializdListEntry) {
  return entry.season != null && entry.episode != null
    ? routes.episode(entry.item.id, entry.season, entry.episode)
    : routes.details(entry.item.id);
}

function SerializdListItems({ username, id, url, onBack }: { username: string | null; id: string; url: string; onBack: () => void }) {
  const query = useSuspenseSerializdListQuery(username, id);
  const list = query.data;
  const pushRoute = usePushRoute();
  const { openActions, sheetProps } = useCardActions();
  return (
    <>
      <Head><title>{`${list.title} — Shinobu`}</title></Head>
      <ListsHeader onBack={onBack} provider="serializd" title={list.title} />
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

function SerializdListSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <>
      <ListsHeader onBack={onBack} provider="serializd" title="List" />
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

export function SerializdListsScreen() {
  const router = useRouter();
  const pushRoute = usePushRoute();
  const { id, kind: kindParam } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const connected = useConnectedProviders();
  const username = connected.includes('serializd') ? getSerializdUsername() : null;
  const kind = kindParam === 'liked' ? 'liked' : 'created';
  const detail = id != null;
  const url = detail ? serializdListUrl(id) : serializdListsUrl(username ?? '');
  const title = detail ? 'List' : listsTitle(kind);
  const { reset } = useQueryErrorResetBoundary();
  function back() {
    if (router.canGoBack()) router.back();
    else router.replace(routes.home);
  }
  return (
    <View className="flex-1 bg-background">
      <Head><title>{`${title} — Shinobu`}</title></Head>
      {!detail && <ListsHeader onBack={back} provider="serializd" title={title} />}
      {url == null ? (
        <>
          {detail && <ListsHeader onBack={back} provider="serializd" title={title} />}
          <CenteredNotice>
            <CenteredNotice.Title>{detail ? 'Invalid list link' : 'Connect Serializd'}</CenteredNotice.Title>
            <CenteredNotice.Body>{detail ? 'This link doesn’t identify a Serializd list.' : 'Connect Serializd to browse your created and liked lists.'}</CenteredNotice.Body>
            {!detail && <CenteredNotice.Action icon={<Button.Icon name="link-outline" />} label="Connect Serializd" onPress={() => pushRoute(routes.settings)} />}
          </CenteredNotice>
        </>
      ) : (
        <ErrorBoundary key={`${username}/${url}`} onReset={reset} fallbackRender={({ resetErrorBoundary }) => (
          <>
            {detail && <ListsHeader onBack={back} provider="serializd" title={title} />}
            <CenteredNotice>
              <CenteredNotice.Title>Couldn’t load {detail ? 'this list' : 'your lists'}</CenteredNotice.Title>
              <CenteredNotice.Body>The list may be private, unavailable, or your Serializd session may need reconnecting.</CenteredNotice.Body>
              <CenteredNotice.Action icon={<Button.Icon name="refresh" />} label="Try again" onPress={resetErrorBoundary} />
              <ProviderListLink provider="serializd" url={url} />
            </CenteredNotice>
          </>
        )}>
          <Suspense fallback={detail ? <SerializdListSkeleton onBack={back} /> : <ListsRowSkeleton />}>
            {detail ? <SerializdListItems id={id} onBack={back} url={url} username={username} /> : <SerializdListsIndex kind={kind} url={url} username={username ?? ''} />}
          </Suspense>
        </ErrorBoundary>
      )}
    </View>
  );
}
