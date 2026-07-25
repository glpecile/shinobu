import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Head from '@/components/head';
import { List } from '@/components/List';
import { MediaCard } from '@/components/media-card';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { routes } from '@/lib/routes';
import { useVisibleItems } from '@/state/prefs/hidden-items';
import { useLetterboxdWatchlistPagesQuery } from '@/state/queries/letterboxd';
import type { NormalizedMediaItem } from '@/types/media';

/** `MediaCard`'s width plus its gutter — the grid column pitch, in px. */
const COLUMN_PITCH = 172;
const ROW_HEIGHT = 252;
/** Matches the `max-w-4xl` content column the rest of the app uses. */
const MAX_CONTENT_WIDTH = 896;

function useColumnCount(): number {
  const { width } = useWindowDimensions();
  const usable = Math.min(width, MAX_CONTENT_WIDTH) - 32;
  return Math.max(2, Math.floor(usable / COLUMN_PITCH));
}

/**
 * Centered message with an action — the initial-load failure and the empty
 * state. A dedicated screen must never degrade to a blank page.
 */
function CenteredNotice({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-2xl font-display text-foreground text-center">
        {title}
      </Text>
      <Text className="text-base font-sans text-muted mt-3 text-center max-w-xs leading-relaxed">
        {body}
      </Text>
      {actionLabel != null && onAction != null && (
        <PresstableOpacity
          className="bg-accent px-5 py-3 rounded mt-6"
          onPress={onAction}
        >
          <Text className="text-accent-foreground font-sans-semibold">
            {actionLabel}
          </Text>
        </PresstableOpacity>
      )}
    </View>
  );
}

/**
 * End-of-list footer. A page failing mid-scroll keeps every loaded page on
 * screen and offers a retry right where the scroll stopped — the same
 * partial-failure treatment as the diary's failure banner.
 */
function GridFooter({
  loading,
  failed,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <View className="items-center py-8 px-8">
        <Text className="text-muted font-sans text-sm text-center">
          Couldn’t load more films.
        </Text>
        <PresstableOpacity
          accessibilityLabel="Retry loading more films"
          className="border border-border bg-surface px-4 py-2 rounded mt-3"
          onPress={onRetry}
        >
          <Text className="text-foreground font-sans-semibold text-sm">
            Try again
          </Text>
        </PresstableOpacity>
      </View>
    );
  }
  if (!loading) return <View className="h-12" />;
  return (
    <View className="items-center py-8">
      <Text className="text-muted font-sans text-sm">Loading more…</Text>
    </View>
  );
}

export default function LetterboxdWatchlistScreen() {
  const router = useRouter();
  const columns = useColumnCount();
  const foreground = useCSSVariable('--color-foreground');
  const { openActions, sheetProps } = useCardActions();
  const [refreshing, setRefreshing] = useState(false);
  const watchlist = useLetterboxdWatchlistPagesQuery();
  const items = useVisibleItems(
    watchlist.data?.pages.flat() ?? ([] as NormalizedMediaItem[]),
  );

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace(routes.home);
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await watchlist.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  // Only a failure with nothing on screen takes over the page; a later page
  // failing is a footer concern (loaded pages stay visible).
  const initialFailure = watchlist.isError && items.length === 0;

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Watchlist — Shinobu</title>
      </Head>
      <View
        className={`flex-row items-center gap-3 px-6 ${screenHeaderTopPadding} pb-4`}
      >
        <PresstableOpacity
          accessibilityLabel="Back"
          className="w-9 h-9 -ml-2 items-center justify-center rounded-full"
          onPress={goBack}
        >
          <Ionicons
            color={typeof foreground === 'string' ? foreground : undefined}
            name="arrow-back"
            size={22}
          />
        </PresstableOpacity>
        <ProviderIcon id="letterboxd" size={18} />
        <Text className="text-2xl font-display text-foreground">Watchlist</Text>
      </View>

      {initialFailure ? (
        <CenteredNotice
          actionLabel="Try again"
          body="Your Letterboxd watchlist couldn’t be loaded. Check your connection and try again."
          onAction={() => void watchlist.refetch()}
          title="Something went wrong"
        />
      ) : watchlist.isLoading ? (
        <CenteredNotice body="Loading your watchlist…" title="Watchlist" />
      ) : items.length === 0 ? (
        <CenteredNotice
          body="Films you add to your Letterboxd watchlist show up here."
          title="Nothing here yet"
        />
      ) : (
        <List
          key={`columns-${columns}`}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16 }}
          data={items}
          estimatedItemSize={ROW_HEIGHT}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          onEndReached={
            watchlist.hasNextPage && !watchlist.isFetchingNextPage
              ? () => void watchlist.fetchNextPage()
              : undefined
          }
          onEndReachedThreshold={0.6}
          refreshControl={
            <RefreshControl onRefresh={refresh} refreshing={refreshing} />
          }
          renderItem={({ item }) => (
            <View className="items-center mb-3">
              <MediaCard
                item={item}
                onActionsPress={openActions}
                onPress={(pressed) => router.push(routes.details(pressed.id))}
              />
            </View>
          )}
          ListFooterComponent={
            <GridFooter
              failed={watchlist.isError}
              loading={watchlist.isFetchingNextPage}
              onRetry={() => void watchlist.fetchNextPage()}
            />
          }
        />
      )}
      <CardActionsSheet {...sheetProps} />
    </View>
  );
}

/**
 * Route-level containment: this screen already renders its own retry for
 * query failures, so the boundary only catches render-time faults — still
 * better here than the root boundary blanking the app.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <CenteredNotice
        actionLabel="Try again"
        body="Your Letterboxd watchlist couldn’t be displayed."
        onAction={retry}
        title="Something went wrong"
      />
      <PresstableOpacity
        className="self-center mb-12"
        onPress={() => router.replace(routes.home)}
      >
        <Text className="text-muted font-sans">Go home</Text>
      </PresstableOpacity>
    </View>
  );
}
