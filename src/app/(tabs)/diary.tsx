import { useMutation } from '@tanstack/react-query';
import type { ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { CenteredNotice } from '@/components/centered-notice';
import { DeferredTab } from '@/components/deferred-tab';
import Head from '@/components/head';
import { OfflineBanner } from '@/components/offline-banner';
import { homeHeaderClassName, homeHeaderTitleSize } from '@/components/screen-header-spacing';
import { SectionEnter } from '@/components/section-enter';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { DiaryList, DiaryListSkeleton } from '@/features/diary/diary-list';
import { DiaryWelcome } from '@/features/diary/diary-welcome';
import { DiaryFormatFilter } from '@/features/diary/format-filter';
import { DIARY_FORMAT_OPTIONS, type DiaryFormat } from '@/features/diary/merge';
import { PendingLogs } from '@/features/log-media/pending-logs-sheet';
import { cn } from '@/lib/cn';
import { feedReadsType } from '@/lib/providers/routing';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useDiaryFeedQuery } from '@/state/queries/use-diary-feed';
import { useConnectedProviders } from '@/state/session';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Diary — Shinobu</title>
      </Head>
      <DiaryHeader />
      <CenteredNotice>
        <CenteredNotice.Title>Couldn’t display your diary</CenteredNotice.Title>
        <CenteredNotice.Body>Try again, or switch to another screen.</CenteredNotice.Body>
        <CenteredNotice.Action
          icon={<Button.Icon name="refresh" />}
          label="Try again"
          onPress={retry}
        />
      </CenteredNotice>
    </View>
  );
}

function DiaryHeader({ children }: { children?: React.ReactNode }) {
  return (
    <View className={cn(homeHeaderClassName, 'ios:flex-wrap android:flex-wrap gap-x-4 gap-y-2')}>
      <Text className={cn(homeHeaderTitleSize, 'font-display text-foreground tracking-tight')}>
        Diary
      </Text>
      {children}
    </View>
  );
}

export default function DiaryTab() {
  return (
    <DeferredTab>
      <DiaryScreen />
    </DeferredTab>
  );
}

function DiaryScreen() {
  const pushRoute = usePushRoute();
  const connected = useConnectedProviders();
  const diary = useDiaryFeedQuery();
  const retry = useMutation({ mutationFn: diary.refetch });
  const { openActions, sheetProps } = useCardActions();
  const [picked, setPicked] = useState<DiaryFormat>('ALL');
  const reading = {
    chapters: feedReadsType(connected, 'MANGA'),
    books: feedReadsType(connected, 'BOOK'),
  };
  const options = DIARY_FORMAT_OPTIONS.filter(
    (option) => option.value !== 'READING' || reading.chapters || reading.books,
  );
  const format = options.some((option) => option.value === picked) ? picked : 'ALL';
  const formatControl = <DiaryFormatFilter onChange={setPicked} options={options} value={format} />;
  let filter: React.ReactNode = null;

  let content: React.ReactNode;
  if (connected.length === 0) {
    content = <DiaryWelcome timeZone={diary.timeZone} />;
  } else if (diary.activeProviders.length === 0) {
    content = (
      <CenteredNotice className="mb-16">
        <CenteredNotice.Icon name="phone-portrait-outline" />
        <CenteredNotice.Title>Open your diary on mobile</CenteredNotice.Title>
        <CenteredNotice.Body>
          Letterboxd can only be read from the mobile app — open Shinobu on your phone to see your
          diary.
        </CenteredNotice.Body>
      </CenteredNotice>
    );
  } else if (diary.isLoading) {
    // Wait for all providers before revealing so staggered arrivals don't reshuffle rows (docs/solutions/diary-reshuffles-while-providers-land.md).
    filter = formatControl;
    content = <DiaryListSkeleton />;
  } else if (diary.allFailed && diary.entryCount === 0) {
    content = (
      <CenteredNotice className="mb-16">
        <CenteredNotice.Icon name="cloud-offline-outline" />
        <CenteredNotice.Title>Couldn’t load your diary</CenteredNotice.Title>
        <CenteredNotice.Body>
          Your trackers didn’t respond. Check your connection and try again.
        </CenteredNotice.Body>
        <CenteredNotice.Action
          icon={<Button.Icon name="refresh" />}
          label="Try again"
          loading={retry.isPending}
          onPress={() => retry.mutate()}
        />
      </CenteredNotice>
    );
  } else if (diary.entryCount === 0 && !diary.hasNextPage) {
    content = (
      <CenteredNotice className="mb-16">
        <CenteredNotice.Icon name="book-outline" />
        <CenteredNotice.Title>No logs yet</CenteredNotice.Title>
        <CenteredNotice.Body>
          Log a movie, show, or anime and it’ll show up here — and in every tracker you’ve
          connected.
        </CenteredNotice.Body>
        <CenteredNotice.Action
          icon={<Button.Icon name="search-outline" />}
          label="Find something to log"
          onPress={() => pushRoute(routes.search)}
        />
      </CenteredNotice>
    );
  } else {
    filter = formatControl;
    content = (
      <DiaryList
        days={diary.days}
        format={format}
        reading={reading}
        failedProviders={diary.errors.map((entry) => entry.provider)}
        hasNextPage={diary.hasNextPage}
        isFetchingNextPage={diary.isFetchingNextPage}
        onEndReached={diary.fetchNextPage}
        onItemActions={openActions}
        onOpen={pushRoute}
        onRefresh={diary.refetch}
        onShowAll={() => setPicked('ALL')}
        onRetry={() => {
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
      <DiaryHeader>
        <View className="flex-row items-center gap-2">
          <PendingLogs />
          {filter}
        </View>
      </DiaryHeader>
      <OfflineBanner />
      <SectionEnter className="flex-1" key={diary.isLoading ? 'skeleton' : 'content'}>
        {content}
      </SectionEnter>
      <CardActionsSheet {...sheetProps} canWatchlist={false} hideLabel="Hide from diary" />
    </View>
  );
}
