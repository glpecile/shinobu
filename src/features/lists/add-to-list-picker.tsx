import Ionicons from '@react-native-vector-icons/ionicons/static';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Suspense, useState } from 'react';
import { Text, View } from 'react-native';
import { ErrorBoundary } from 'react-error-boundary';

import { Button } from '@/components/button';
import { CenteredNotice } from '@/components/centered-notice';
import { ConnectHardcoverButton } from '@/components/connect-hardcover-button';
import { List } from '@/components/List';
import { PresstableOpacity } from '@/components/presstable';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { SmallPoster } from '@/components/small-poster';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { haptics } from '@/lib/haptics';
import { usePushRoute } from '@/lib/navigation';
import { letterboxdListsUrl } from '@/lib/providers/letterboxd/lists';
import { PROVIDERS } from '@/lib/providers/registry';
import { listProviderFor } from '@/lib/providers/routing';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import { useSuspenseHardcoverListMembershipQuery } from '@/state/queries/hardcover';
import type { ListEditTarget } from '@/state/queries/list-membership';
import { useSuspenseLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { useSuspenseSerializdListsQuery } from '@/state/queries/serializd';
import { useConnectedProviders, useHardcoverListsGranted } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import type { NormalizedMediaItem } from '@/types/media';
import { useHardcoverListsPrompt } from './hardcover-lists-prompt';
import { ListMembershipForm } from './list-membership-form';
import { ListsLoadError } from './lists-page';
import {
  hardcoverListSummary,
  letterboxdListSummary,
  serializdListSummary,
  type ListSummary,
} from './list-summary';

type ListProvider = ListSummary['provider'];

function editTarget(list: ListSummary, username: string): ListEditTarget {
  switch (list.provider) {
    case Provider.Letterboxd:
      return {
        provider: list.provider,
        username,
        owner: list.owner,
        slug: list.slug,
        title: list.title,
        url: list.url,
      };
    case Provider.Serializd:
      return { provider: list.provider, username, id: list.id, title: list.title, url: list.url };
    case Provider.Hardcover:
      return {
        provider: list.provider,
        username: list.owner,
        id: list.id,
        title: list.title,
        url: list.url,
      };
  }
}

function listUsername(provider: ListProvider) {
  switch (provider) {
    case Provider.Letterboxd:
      return getLetterboxdUsername();
    case Provider.Serializd:
      return getSerializdUsername();
    case Provider.Hardcover:
      return '';
  }
}

function emptyBody(provider: ListProvider) {
  switch (provider) {
    case Provider.Letterboxd:
      return 'Start one here, or on Letterboxd. Private lists aren’t available in Shinobu.';
    case Provider.Serializd:
      return 'Start one here, or on Serializd.';
    case Provider.Hardcover:
      return 'Start one here, or on Hardcover.';
  }
}

function ListRows({
  provider,
  lists,
  entryIds,
  hasNextPage = false,
  isFetchingNextPage = false,
  fetchNextPage,
  onSelect,
  onCreate,
}: {
  provider: ListProvider;
  lists: readonly ListSummary[];
  entryIds?: ReadonlyMap<string, string>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  onSelect: (list: ListSummary, entryId?: string) => void;
  onCreate: () => void;
}) {
  const accent = useThemeColor('--color-accent');
  return (
    <>
      <List
        data={lists}
        estimatedItemSize={70}
        keyExtractor={(list) => list.id}
        scrollEnabled={false}
        style={{ minHeight: 70 }}
        renderItem={({ item: list }) => {
          const entryId = entryIds?.get(list.id);
          const meta = [
            entryId == null ? null : 'In this list',
            list.count === '' ? null : list.count,
          ]
            .filter((part) => part != null)
            .join(' · ');
          return (
            <PresstableOpacity
              accessibilityHint={entryId == null ? undefined : 'Opens the option to remove it'}
              accessibilityLabel={meta === '' ? list.title : `${list.title}, ${meta}`}
              accessibilityRole="button"
              className="flex-row items-center gap-3 py-2"
              onPress={() => {
                haptics.selection();
                onSelect(list, entryId);
              }}
            >
              <SmallPoster
                recyclingKey={list.id}
                size="sm"
                uri={list.previews[0]?.coverImage ?? ''}
              />
              <View className="flex-1 min-w-0">
                <Text className="text-foreground font-sans-semibold text-sm" numberOfLines={2}>
                  {list.title}
                </Text>
                {meta !== '' && <Text className="text-muted font-sans text-xs mt-1">{meta}</Text>}
              </View>
              {entryId != null && (
                <Ionicons accessible={false} color={accent} name="checkmark-circle" size={20} />
              )}
            </PresstableOpacity>
          );
        }}
        ListEmptyComponent={
          <CenteredNotice className="min-h-60">
            <CenteredNotice.Icon name="list-outline" />
            <CenteredNotice.Title>No lists yet</CenteredNotice.Title>
            <CenteredNotice.Body>{emptyBody(provider)}</CenteredNotice.Body>
          </CenteredNotice>
        }
      />
      {hasNextPage && fetchNextPage != null && (
        <Button
          className="mt-2"
          icon={<Button.Icon name="chevron-down" />}
          label="More lists"
          loading={isFetchingNextPage}
          loadingLabel="Loading…"
          onPress={fetchNextPage}
          variant="ghost"
        />
      )}
      <Button
        className="mt-4"
        icon={<Button.Icon name="add" />}
        label="New list"
        onPress={onCreate}
        variant="quiet"
      />
    </>
  );
}

type PickerProps = {
  username: string;
  onSelect: (list: ListSummary, entryId?: string) => void;
  onCreate: () => void;
};

function LetterboxdListRows({ username, onSelect, onCreate }: PickerProps) {
  const pages = useSuspenseLetterboxdListsQuery(username, 'created');
  if (pages.data == null)
    return (
      <ListsLoadError
        index
        onRetry={() => pages.refetch()}
        provider={Provider.Letterboxd}
        url={letterboxdListsUrl(username, 'created') ?? ''}
      />
    );
  return (
    <ListRows
      fetchNextPage={() => void pages.fetchNextPage()}
      hasNextPage={pages.hasNextPage}
      isFetchingNextPage={pages.isFetchingNextPage}
      lists={pages.data.pages.flatMap((page) => page.lists).map(letterboxdListSummary)}
      onCreate={onCreate}
      onSelect={onSelect}
      provider={Provider.Letterboxd}
    />
  );
}

function SerializdListRows({ username, onSelect, onCreate }: PickerProps) {
  const pages = useSuspenseSerializdListsQuery(username, 'created');
  return (
    <ListRows
      fetchNextPage={() => void pages.fetchNextPage()}
      hasNextPage={pages.hasNextPage}
      isFetchingNextPage={pages.isFetchingNextPage}
      lists={pages.data.pages.flatMap((page) => page.lists).map(serializdListSummary)}
      onCreate={onCreate}
      onSelect={onSelect}
      provider={Provider.Serializd}
    />
  );
}

function HardcoverListRows({
  bookId,
  onSelect,
  onCreate,
}: Omit<PickerProps, 'username'> & { bookId: number }) {
  const { data } = useSuspenseHardcoverListMembershipQuery(bookId);
  return (
    <ListRows
      entryIds={
        new Map(data.flatMap((list) => (list.entryId == null ? [] : [[list.id, list.entryId]])))
      }
      lists={data.map(hardcoverListSummary)}
      onCreate={onCreate}
      onSelect={onSelect}
      provider={Provider.Hardcover}
    />
  );
}

function ProviderListRows({
  provider,
  item,
  ...props
}: PickerProps & { provider: ListProvider; item: NormalizedMediaItem }) {
  switch (provider) {
    case Provider.Letterboxd:
      return <LetterboxdListRows {...props} />;
    case Provider.Serializd:
      return <SerializdListRows {...props} />;
    case Provider.Hardcover:
      return item.externalIds.hardcover == null ? null : (
        <HardcoverListRows
          bookId={item.externalIds.hardcover}
          onCreate={props.onCreate}
          onSelect={props.onSelect}
        />
      );
  }
}

function ListPicker({
  provider,
  item,
  username,
  onSelect,
  onCreate,
  onClose,
}: PickerProps & { provider: ListProvider; item: NormalizedMediaItem; onClose: () => void }) {
  const label = PROVIDERS[provider].label;
  const granted = useHardcoverListsGranted();
  const prompt = useHardcoverListsPrompt();
  return (
    <WriteSheet.Step>
      <WriteSheet.Header onClose={onClose}>
        <WriteSheet.Title>Add to list</WriteSheet.Title>
      </WriteSheet.Header>
      <WriteSheet.Description>{`Your ${label} lists`}</WriteSheet.Description>
      <View className="mt-4">
        {provider === Provider.Hardcover && !granted ? (
          <CenteredNotice className="min-h-60">
            <CenteredNotice.Icon name="list-outline" />
            <CenteredNotice.Title>{prompt.title}</CenteredNotice.Title>
            <CenteredNotice.Body>{prompt.body}</CenteredNotice.Body>
            <View className="mt-6 w-full max-w-xs">
              <ConnectHardcoverButton />
            </View>
          </CenteredNotice>
        ) : (
          <QueryErrorResetBoundary>
            {({ reset }) => (
              <ErrorBoundary
                onReset={reset}
                fallbackRender={({ resetErrorBoundary }) => (
                  <CenteredNotice className="min-h-60">
                    <CenteredNotice.Icon name="cloud-offline-outline" />
                    <CenteredNotice.Title>Couldn’t load your lists</CenteredNotice.Title>
                    <CenteredNotice.Body>Check your connection and try again.</CenteredNotice.Body>
                    <CenteredNotice.Action
                      icon={<Button.Icon name="refresh" />}
                      label="Try again"
                      onPress={resetErrorBoundary}
                    />
                  </CenteredNotice>
                )}
              >
                <Suspense
                  fallback={
                    <View accessibilityLabel="Loading your lists">
                      {[0, 1, 2].map((index) => (
                        <View className="flex-row items-center gap-3 py-2" key={index}>
                          <Skeleton className="w-9 h-13.5 rounded" delay={staggerDelay(index)} />
                          <View className="flex-1 gap-2">
                            <Skeleton className="h-4 w-3/4 rounded" delay={staggerDelay(index)} />
                            <Skeleton className="h-3 w-12 rounded" delay={staggerDelay(index)} />
                          </View>
                        </View>
                      ))}
                    </View>
                  }
                >
                  <ProviderListRows
                    item={item}
                    onCreate={onCreate}
                    onSelect={onSelect}
                    provider={provider}
                    username={username}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
          </QueryErrorResetBoundary>
        )}
      </View>
    </WriteSheet.Step>
  );
}

export function AddToListPicker({
  item,
  onClose,
  onBack = onClose,
}: {
  item: NormalizedMediaItem;
  onClose: () => void;
  onBack?: () => void;
}) {
  const pushRoute = usePushRoute();
  const provider = listProviderFor(item, useConnectedProviders());
  const [selected, setSelected] = useState<{ target: ListEditTarget; entryId?: string } | null>(
    null,
  );
  const username = provider == null ? null : listUsername(provider);
  if (provider == null || username == null) return null;
  return selected == null ? (
    <ListPicker
      item={item}
      onClose={onBack}
      onCreate={() => {
        onClose();
        pushRoute(routes.newList(provider, item));
      }}
      onSelect={(list, entryId) => setSelected({ target: editTarget(list, username), entryId })}
      provider={provider}
      username={username}
    />
  ) : (
    <ListMembershipForm
      entryId={selected.entryId}
      item={item}
      onBack={() => setSelected(null)}
      onDone={onClose}
      present={selected.entryId == null}
      target={selected.target}
    />
  );
}

export function useCanAddToList(item: NormalizedMediaItem): boolean {
  const provider = listProviderFor(item, useConnectedProviders());
  return provider != null && listUsername(provider) != null;
}
