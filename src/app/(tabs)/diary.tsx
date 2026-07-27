import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Head from '@/components/head';
import { EmptyStateTile } from '@/components/empty-state-tile';
import {
  homeHeaderClassName,
  homeHeaderTitleSize,
} from '@/components/screen-header-spacing';
import { Skeleton } from '@/components/skeleton';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { DiaryList } from '@/features/diary/diary-list';
import { cn } from '@/lib/cn';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useDiaryFeedQuery } from '@/state/queries/use-diary-feed';
import { useConnectedProviders } from '@/state/session';

function DiaryHeader() {
  // Same brand-header treatment as Home (spacing + title size) so top-level
  // destinations share one header rhythm.
  return (
    <View className={homeHeaderClassName}>
      <Text
        className={cn(
          homeHeaderTitleSize,
          'font-display text-foreground tracking-tight',
        )}
      >
        Diary
      </Text>
    </View>
  );
}

/** A glyph tile for the empty states — muted book/journal mark. */
function StateIcon({ name }: { name: React.ComponentProps<typeof Ionicons>['name'] }) {
  const muted = useCSSVariable('--color-muted');
  return (
    <Ionicons
      color={typeof muted === 'string' ? muted : undefined}
      name={name}
      size={44}
    />
  );
}

function DiarySkeleton() {
  return (
    <View className="pt-4">
      <View className="px-6 pb-2">
        <Skeleton className="h-3 w-20 rounded" />
      </View>
      {Array.from({ length: 7 }).map((_, index) => (
        <View className="flex-row items-center px-6 py-2.5" key={index}>
          <Skeleton className="w-12 h-[72px] rounded" />
          <View className="flex-1 ml-4">
            <Skeleton className="h-4 w-2/3 rounded" />
            <Skeleton className="h-3 w-20 rounded mt-2" />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * The Diary screen (plan 0016 U5): a unified, reverse-chronological, infinitely
 * scrolling list of watch/read logs aggregated across every connected provider.
 * The four R9 zero-entry states take precedence in order — no providers → a
 * mobile-only degrade → a total load failure → an honest "no logs yet" — so a
 * total failure never masquerades as emptiness (AE5). The loading/failure
 * posture is computed from several queries at once (the aggregate case AGENTS.md
 * allows), not single-query branching.
 */
export default function DiaryScreen() {
  const pushRoute = usePushRoute();
  const connected = useConnectedProviders();
  const diary = useDiaryFeedQuery();
  const { openActions, sheetProps } = useCardActions();

  function openDetails(id: string) {
    pushRoute(routes.details(id));
  }

  let content: React.ReactNode;
  if (connected.length === 0) {
    // R9 (1): no providers connected.
    content = (
      <View className="flex-1 justify-center pb-16">
        <EmptyStateTile
          cta={{ label: 'Connect your trackers', onPress: () => pushRoute(routes.connect) }}
          description="Connect a tracker to see everything you've logged — from Shinobu and from the providers directly — in one place."
          icon={<StateIcon name="book-outline" />}
          title="Your diary lives here"
        />
      </View>
    );
  } else if (diary.activeProviders.length === 0) {
    // R9 (2): connected, but nothing readable on this platform (Letterboxd on web).
    content = (
      <View className="flex-1 justify-center pb-16">
        <EmptyStateTile
          description="Letterboxd can only be read from the mobile app — open Shinobu on your phone to see your diary."
          icon={<StateIcon name="phone-portrait-outline" />}
          title="Open your diary on mobile"
        />
      </View>
    );
  } else if (diary.isLoading && diary.entryCount === 0) {
    content = <DiarySkeleton />;
  } else if (diary.allFailed && diary.entryCount === 0) {
    // R9 (3): every capable provider failed on load — never "no logs yet" (AE5).
    content = (
      <View className="flex-1 justify-center pb-16">
        <EmptyStateTile
          cta={{ label: 'Retry', onPress: () => diary.refetch() }}
          description="Something went wrong reaching your trackers. Check your connection and try again."
          icon={<StateIcon name="cloud-offline-outline" />}
          title="Couldn't load your diary"
        />
      </View>
    );
  } else if (diary.entryCount === 0) {
    // R9 (4): loaded cleanly, genuinely nothing logged yet.
    content = (
      <View className="flex-1 justify-center pb-16">
        <EmptyStateTile
          description="Log a movie, show, or anime and it'll show up here — and in every tracker you've connected."
          icon={<StateIcon name="book-outline" />}
          title="No logs yet"
        />
      </View>
    );
  } else {
    content = (
      <DiaryList
        days={diary.days}
        failedProviders={diary.errors.map((entry) => entry.provider)}
        hasNextPage={diary.hasNextPage}
        isFetchingNextPage={diary.isFetchingNextPage}
        onEndReached={diary.fetchNextPage}
        onItemActions={openActions}
        onOpen={openDetails}
        onRefresh={diary.refetch}
        onRetry={() => {
          // Re-attempt the failed provider reads (initial or pagination).
          void diary.refetch();
        }}
        timeZone={diary.timeZone}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Diary — Shinobu</title>
      </Head>
      <DiaryHeader />
      {content}
      {/* Same dialog as the feed's cards, opened by a row long-press (or the
          web hover ⋯) — the hide row names this surface. */}
      <CardActionsSheet {...sheetProps} hideLabel="Hide from diary" />
    </View>
  );
}
