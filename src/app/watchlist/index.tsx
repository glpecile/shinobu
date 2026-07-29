import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Suspense, useState } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Head from '@/components/head';
import { PresstableOpacity } from '@/components/presstable';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { PosterWall } from '@/features/watchlist/poster-wall';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { useSuspenseWatchlistQuery } from '@/features/watchlist/use-watchlist-entries';
import { cn } from '@/lib/cn';
import { usePushRoute } from '@/lib/navigation';
import { PROVIDERS } from '@/lib/providers/registry';
import { routes } from '@/lib/routes';
import { useLetterboxdWatchlistPagesQuery } from '@/state/queries/letterboxd';
import type { ProviderFailure } from '@/state/queries/settle';
import {
  refreshWatchlistInputs,
  watchlistQueryKeys,
} from '@/state/queries/watchlist';

/**
 * The cross-provider watchlist grid (plan 0031 R24). One surface for every
 * connected provider's watchlist, merged by `computeWatchlist` — which is why
 * the header carries **no** provider mark: a merged surface must not wear one
 * provider's brand. `/watchlist/letterboxd` survives beside it as a redirect.
 *
 * **Partial failure here is one list plus an inline notice, not a
 * `SuspenseSection` per source — a deliberate, argued divergence from
 * AGENTS.md § Loading & Error States (KTD-12), not a shortcut.** That default
 * rests on an assumption this surface breaks: that each section can render
 * independently. Dedupe needs *every* source in hand before anything can
 * render, so there is no per-source subtree to wrap, and wrapping the whole
 * grid in one boundary would blank it when one provider fails — worse than the
 * default. So the gather captures each leg's failure (`settle`) and the screen
 * renders the rows it has plus one line naming the provider that failed, with a
 * retry. Naming a provider in a *result* is exactly where AGENTS.md permits it,
 * and the notice is informational: it is **not** a per-provider toggle —
 * hide/collapse operates on items and sections, never providers. Do not "fix"
 * this back to the default. The home *row* keeps its single `SuspenseSection`;
 * one row is one slot, so the default applies there.
 */

/**
 * Centered message with an action — the total-failure and empty states. A
 * dedicated screen must never degrade to a blank page.
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
 * R29's inline notice: one line per failed leg, above the wall, with a single
 * retry. The rows that *did* load stay on screen behind it.
 */
function LegFailureNotice({
  failures,
  onRetry,
}: {
  failures: readonly ProviderFailure[];
  onRetry: () => void;
}) {
  if (failures.length === 0) return null;
  return (
    <View className="mx-3 mb-2 px-4 py-3 rounded border border-border bg-surface">
      {failures.map((failure) => (
        <Text
          className="text-muted font-sans text-sm"
          key={failure.provider}
        >{`Couldn’t load your ${PROVIDERS[failure.provider].label} watchlist.`}</Text>
      ))}
      <PresstableOpacity
        accessibilityLabel="Retry loading your watchlist"
        className="self-start mt-2"
        onPress={onRetry}
      >
        <Text className="text-accent font-sans-semibold text-sm">Try again</Text>
      </PresstableOpacity>
    </View>
  );
}

/**
 * End-of-list footer. A Letterboxd page failing mid-scroll keeps every loaded
 * page on screen and offers a retry right where the scroll stopped — the same
 * partial-failure treatment as the notice above.
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

function WatchlistGrid() {
  const pushRoute = usePushRoute();
  const queryClient = useQueryClient();
  const { openActions, sheetProps } = useCardActions();
  const [refreshing, setRefreshing] = useState(false);
  // The row the sheet was opened from, held in state rather than looked up out
  // of `entries` on every render (plan 0031 U16). That is the difference between
  // a removal you can read the result of and one you cannot: a successful
  // removal takes the entry *out* of `entries` when the refetch lands, so a
  // derived lookup would unmount the button — and its failure lines, its
  // AniList refusal, its unknown-membership rows — at exactly the moment they
  // matter. Cleared with the sheet, never mid-write.
  const [activeEntry, setActiveEntry] = useState<WatchlistEntry | null>(null);
  const { entries, errors, incomplete } = useSuspenseWatchlistQuery();
  // Letterboxd is the only paginated leg, and it stays behind `onEndReached` —
  // **never** auto-paged to complete dedupe (22 sequential scrapes per gather
  // is exactly what plan 0031's scope boundary rules out). This observer is the
  // pager only; the films it loads reach the wall through the gather's
  // `pages.flat()`, so an appended page merges against the Trakt leg instead of
  // rendering as a duplicate of a row already on screen.
  const pages = useLetterboxdWatchlistPagesQuery();
  const items = entries.map((entry) => entry.item);

  async function refresh() {
    setRefreshing(true);
    try {
      await refreshWatchlistInputs(queryClient);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadMore() {
    await pages.fetchNextPage();
    // The new page lands in the infinite entry, not in the merge — the gather
    // has to re-read it. Every leg is fresh inside its own stale window, so
    // this re-merges without spending a request.
    await queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.inputs() });
  }

  // Only a total failure takes over the page: `settle` means one leg failing
  // still yields rows, and those rows plus the notice beat a blank screen.
  if (items.length === 0 && errors.length > 0) {
    return (
      <CenteredNotice
        actionLabel="Try again"
        body="Your watchlist couldn’t be loaded. Check your connection and try again."
        onAction={() => void refresh()}
        title="Something went wrong"
      />
    );
  }

  if (items.length === 0) {
    return (
      <CenteredNotice
        body="Anything you add to a connected tracker’s watchlist shows up here."
        title="Nothing here yet"
      />
    );
  }

  return (
    <>
      <LegFailureNotice failures={errors} onRetry={() => void refresh()} />
      <PosterWall
        footer={
          <GridFooter
            failed={pages.isError}
            loading={pages.isFetchingNextPage}
            onRetry={() => void loadMore()}
          />
        }
        items={items}
        onEndReached={
          pages.hasNextPage && !pages.isFetchingNextPage
            ? () => void loadMore()
            : undefined
        }
        onItemActions={(item) => {
          setActiveEntry(entries.find((entry) => entry.item.id === item.id) ?? null);
          openActions(item);
        }}
        onItemPress={(item) => pushRoute(routes.details(item.id))}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
      />
      {/* The one surface that offers the removal (R35): only a `WatchlistEntry`
          knows which providers actually hold the item, and only this screen has
          one. `errors` rides along because a leg that failed this gather makes
          its provider's membership *unknown*, not absent — and `incomplete`
          for the same reason, one step milder: a leg that read page 1 of 22
          never looked at the film the user is removing. */}
      <CardActionsSheet
        {...sheetProps}
        watchlistRemoval={
          activeEntry == null
            ? null
            : { entry: activeEntry, errors, incomplete }
        }
      />
    </>
  );
}

export default function WatchlistScreen() {
  const router = useRouter();
  const foreground = useCSSVariable('--color-foreground');

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace(routes.home);
  }

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Watchlist — Shinobu</title>
      </Head>
      <View
        className={cn(
          'flex-row items-center gap-3 px-6',
          screenHeaderTopPadding,
          'pb-4',
        )}
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
        {/* No `ProviderIcon` — see the file docblock. */}
        <Text className="text-2xl font-display text-foreground">Watchlist</Text>
      </View>
      <Suspense
        fallback={
          <CenteredNotice body="Loading your watchlist…" title="Watchlist" />
        }
      >
        <WatchlistGrid />
      </Suspense>
    </View>
  );
}

/**
 * Route-level containment: the grid already renders its own retry for gather
 * failures (they are captured, not thrown), so the boundary only catches
 * render-time faults — still better here than the root boundary blanking the
 * app.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <CenteredNotice
        actionLabel="Try again"
        body="Your watchlist couldn’t be displayed."
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
