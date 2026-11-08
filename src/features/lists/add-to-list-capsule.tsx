import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Suspense, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { ErrorBoundary } from 'react-error-boundary';

import { Button } from '@/components/button';
import { CenteredNotice } from '@/components/centered-notice';
import { List } from '@/components/List';
import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { SmallPoster } from '@/components/small-poster';
import { Tooltip } from '@/components/tooltip';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { haptics } from '@/lib/haptics';
import { usePushRoute } from '@/lib/navigation';
import { letterboxdListsUrl } from '@/lib/providers/letterboxd/lists';
import { PROVIDERS } from '@/lib/providers/registry';
import { listProviderFor } from '@/lib/providers/routing';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import type { ListEditTarget } from '@/state/queries/list-membership';
import { useSuspenseLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { useSuspenseSerializdListsQuery } from '@/state/queries/serializd';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import type { NormalizedMediaItem } from '@/types/media';
import { ListMembershipForm } from './list-membership-form';
import { ListsLoadError } from './lists-page';
import { letterboxdListSummary, serializdListSummary, type ListSummary } from './list-summary';

type ListProvider = typeof Provider.Letterboxd | typeof Provider.Serializd;

function editTarget(list: ListSummary, username: string): ListEditTarget {
  switch (list.provider) {
    case Provider.Letterboxd:
      return { provider: list.provider, username, owner: list.owner, slug: list.slug, title: list.title, url: list.url };
    case Provider.Serializd:
      return { provider: list.provider, username, id: list.id, title: list.title, url: list.url };
  }
}

function listUsername(provider: ListProvider) {
  switch (provider) {
    case Provider.Letterboxd:
      return getLetterboxdUsername();
    case Provider.Serializd:
      return getSerializdUsername();
  }
}

function ListRows({ provider, lists, hasNextPage, isFetchingNextPage, fetchNextPage, onSelect, onCreate }: {
  provider: ListProvider;
  lists: readonly ListSummary[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onSelect: (list: ListSummary) => void;
  onCreate: () => void;
}) {
  return <>
    <List
      data={lists}
      estimatedItemSize={70}
      keyExtractor={(list) => list.id}
      scrollEnabled={false}
      style={{ minHeight: 70 }}
      renderItem={({ item: list }) => (
        <PresstableOpacity
          accessibilityLabel={list.count === '' ? list.title : `${list.title}, ${list.count}`}
          accessibilityRole="button"
          className="flex-row items-center gap-3 py-2"
          onPress={() => { haptics.selection(); onSelect(list); }}
        >
          <SmallPoster recyclingKey={list.id} size="sm" uri={list.previews[0]?.coverImage ?? ''} />
          <View className="flex-1 min-w-0">
            <Text className="text-foreground font-sans-semibold text-sm" numberOfLines={2}>{list.title}</Text>
            {list.count !== '' && <Text className="text-muted font-sans text-xs mt-1">{list.count}</Text>}
          </View>
        </PresstableOpacity>
      )}
      ListEmptyComponent={
        <CenteredNotice className="min-h-60">
          <CenteredNotice.Icon name="list-outline" />
          <CenteredNotice.Title>No lists yet</CenteredNotice.Title>
          <CenteredNotice.Body>{provider === Provider.Letterboxd ? 'Start one here, or on Letterboxd. Private lists aren’t available in Shinobu.' : 'Start one here, or on Serializd.'}</CenteredNotice.Body>
        </CenteredNotice>
      }
    />
    {hasNextPage && <Button className="mt-2" icon={<Button.Icon name="chevron-down" />} label="More lists" loading={isFetchingNextPage} loadingLabel="Loading…" onPress={fetchNextPage} variant="ghost" />}
    <Button className="mt-4" icon={<Button.Icon name="add" />} label="New list" onPress={onCreate} variant="quiet" />
  </>;
}

type PickerProps = { username: string; onSelect: (list: ListSummary) => void; onCreate: () => void };

function LetterboxdListRows({ username, onSelect, onCreate }: PickerProps) {
  const pages = useSuspenseLetterboxdListsQuery(username, 'created');
  if (pages.data == null) return <ListsLoadError index onRetry={() => pages.refetch()} provider={Provider.Letterboxd} url={letterboxdListsUrl(username, 'created') ?? ''} />;
  return <ListRows
    fetchNextPage={() => void pages.fetchNextPage()}
    hasNextPage={pages.hasNextPage}
    isFetchingNextPage={pages.isFetchingNextPage}
    lists={pages.data.pages.flatMap((page) => page.lists).map(letterboxdListSummary)}
    onCreate={onCreate}
    onSelect={onSelect}
    provider={Provider.Letterboxd}
  />;
}

function SerializdListRows({ username, onSelect, onCreate }: PickerProps) {
  const pages = useSuspenseSerializdListsQuery(username, 'created');
  return <ListRows
    fetchNextPage={() => void pages.fetchNextPage()}
    hasNextPage={pages.hasNextPage}
    isFetchingNextPage={pages.isFetchingNextPage}
    lists={pages.data.pages.flatMap((page) => page.lists).map(serializdListSummary)}
    onCreate={onCreate}
    onSelect={onSelect}
    provider={Provider.Serializd}
  />;
}

function ListPicker({ provider, username, onSelect, onCreate, onClose }: PickerProps & { provider: ListProvider; onClose: () => void }) {
  return <WriteSheet.Step>
    <WriteSheet.Header onClose={onClose}><WriteSheet.Title>Add to list</WriteSheet.Title></WriteSheet.Header>
    <WriteSheet.Description>{`Your ${PROVIDERS[provider].label} lists`}</WriteSheet.Description>
    <View className="mt-4">
      <QueryErrorResetBoundary>
        {({ reset }) => <ErrorBoundary
          onReset={reset}
          fallbackRender={({ resetErrorBoundary }) => (
            <CenteredNotice className="min-h-60">
              <CenteredNotice.Icon name="cloud-offline-outline" />
              <CenteredNotice.Title>Couldn’t load your lists</CenteredNotice.Title>
              <CenteredNotice.Body>Check your connection and try again.</CenteredNotice.Body>
              <CenteredNotice.Action icon={<Button.Icon name="refresh" />} label="Try again" onPress={resetErrorBoundary} />
            </CenteredNotice>
          )}
        >
          <Suspense fallback={
            <View accessibilityLabel="Loading your lists" className="gap-4">
              {[0, 1, 2].map((index) => (
                <View className="flex-row items-center gap-3" key={index}>
                  <Skeleton className="w-9 h-13.5 rounded" delay={staggerDelay(index)} />
                  <View className="flex-1 gap-2">
                    <Skeleton className="h-4 w-3/4 rounded" delay={staggerDelay(index)} />
                    <Skeleton className="h-3 w-12 rounded" delay={staggerDelay(index)} />
                  </View>
                </View>
              ))}
            </View>
          }>
            {provider === Provider.Letterboxd
              ? <LetterboxdListRows onCreate={onCreate} onSelect={onSelect} username={username} />
              : <SerializdListRows onCreate={onCreate} onSelect={onSelect} username={username} />}
          </Suspense>
        </ErrorBoundary>}
      </QueryErrorResetBoundary>
    </View>
  </WriteSheet.Step>;
}

/**
 * A title's main action with "Add to list" capsuled beside it, as `ShareButton.Capsule` lays out Share.
 * Renders only `children` when no connected provider keeps lists for the item.
 */
export function AddToListCapsule({ item, children }: { item: NormalizedMediaItem; children: ReactNode }) {
  const pushRoute = usePushRoute();
  const provider = listProviderFor(item, useConnectedProviders());
  const [open, setOpen] = useState(false);
  // Remounts the picker per open, so it starts on the lists, not the last confirmation.
  const [session, setSession] = useState(0);
  const [target, setTarget] = useState<ListEditTarget | null>(null);
  const username = provider == null ? null : listUsername(provider);
  if (provider == null || username == null) return children;
  return <>
    {/* items-start: the main action carries its own bottom margin. */}
    <View className="flex-row items-start gap-2">
      <View className="flex-1">{children}</View>
      <Button.Capsule>
        <Tooltip label="Add to list">
          <Button
            icon={<Button.Icon name="add" />}
            iconOnly
            label="Add to list"
            onPress={() => { haptics.selection(); setTarget(null); setSession(session + 1); setOpen(true); }}
            variant="ghost"
          />
        </Tooltip>
      </Button.Capsule>
    </View>
    <Sheet onClose={() => setOpen(false)} open={open}>
      {session > 0 && (target == null
        ? <ListPicker
            key={`pick-${session}`}
            onClose={() => setOpen(false)}
            onCreate={() => { setOpen(false); pushRoute(routes.newList(provider, item)); }}
            onSelect={(list) => setTarget(editTarget(list, username))}
            provider={provider}
            username={username}
          />
        : <ListMembershipForm item={item} key="confirm" onBack={() => setTarget(null)} onDone={() => setOpen(false)} present target={target} />)}
    </Sheet>
  </>;
}
