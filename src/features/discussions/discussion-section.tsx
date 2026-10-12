import { useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Button } from '@/components/button';
import { Rail } from '@/components/rail';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { discussionBoards, discussionSearchUrl, type DiscussionBoard } from '@/lib/http/fourchan';
import { openExternalUrl } from '@/lib/open-external-url';
import { useLinkHandoff } from '@/lib/open-external-url/use-link-handoff';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useDiscussionsQuery } from '@/state/queries/discussions';
import { useAnimeByIdQuery } from '@/state/queries/anilist';
import { useAniListIdByTmdbQuery } from '@/state/queries/mapping';
import type { NormalizedMediaItem } from '@/types/media';
import { DiscussionCard, type DiscussionPreview } from './discussion-card';

const discussionFade = { from: { opacity: 0 }, to: { opacity: 1 } };

export function DiscussionSection({ item, episode }: {
  item: NormalizedMediaItem; episode?: { season: number; number: number };
}) {
  const { data: anilistId } = useAniListIdByTmdbQuery(item);
  const animeId = item.externalIds.anilist ?? anilistId ?? null;
  // AniList-origin items already carry the titles and aliases this read supplies.
  const { data: anime } = useAnimeByIdQuery(item.id.startsWith('anilist-') ? null : animeId);
  const searchItem = {
    ...item,
    titles: { ...item.titles, ...anime?.titles },
    titleAliases: [...(item.titleAliases ?? []), ...(anime?.titleAliases ?? [])],
    externalIds: { ...item.externalIds, ...(animeId != null ? { anilist: animeId } : {}) },
  };
  const boards = discussionBoards(searchItem);
  const { threads, isFetching, refetch } = useDiscussionsQuery(boards, searchItem, episode?.season, episode?.number);
  const searchTitles = [...new Set([searchItem.titles.english ?? item.title, searchItem.titles.romaji])]
    .filter((title): title is string => title != null && title.trim() !== '');
  return <DiscussionResults isFetching={isFetching} onRefresh={refetch} searchTitles={searchTitles} threads={threads} />;
}

function DiscussionSearchLink({ board, title, label }: { board: DiscussionBoard; title: string; label: string }) {
  const { loading, open } = useLinkHandoff(() => openExternalUrl(discussionSearchUrl(board, title), { inApp: false }));
  return (
    <Button
      accessibilityLabel={`Search 4chan /${board}/ for ${title}`}
      align="start"
      icon={<Button.Icon name="open-outline" />}
      label={label}
      loading={loading}
      loadingLabel={label}
      onPress={open}
      variant="quiet"
    />
  );
}

/** Shared by details and the dev preview, including the hidden empty state. */
export function DiscussionResults({ threads, searchTitles = [], isFetching = false, onRefresh }: {
  threads: { board: DiscussionBoard; thread: DiscussionPreview }[];
  searchTitles?: string[];
  isFetching?: boolean;
  onRefresh?: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  if (threads.length === 0) return null;
  const boards = [...new Set(threads.map(({ board }) => board))];
  return (
    <AnimatedView style={{
      animationName: discussionFade,
      animationDuration: reducedMotion ? 1 : DURATION.swap,
      animationTimingFunction: EASE_OUT,
      animationFillMode: 'both',
    }}>
    <Section>
      <Section.Header>
        <Section.Title>Discussion</Section.Title>
        <View className="flex-1" />
        {(onRefresh != null || searchTitles.length > 0) && (
          <Button
            icon={<Button.Icon name="ellipsis-horizontal" />}
            iconOnly
            label="Discussion options"
            onPress={() => setOpen(true)}
            size="sm"
            variant="quiet"
          />
        )}
      </Section.Header>
      <Rail contentContainerClassName="gap-4">
        {threads.map(({ board, thread }) => <DiscussionCard board={board} key={`${board}-${thread.id}`} thread={thread} />)}
      </Rail>
      <Sheet onClose={() => setOpen(false)} open={open}>
        <Sheet.Header className="items-center">
          <Text className="font-display text-xl text-foreground">Discussion options</Text>
        </Sheet.Header>
        <View className="mt-5 gap-2">
          {onRefresh != null && <Button
            align="start"
            icon={<Button.Icon name="refresh" />}
            label="Refresh discussions"
            loading={isFetching}
            loadingLabel="Refreshing discussions"
            onPress={() => {
              setOpen(false);
              void onRefresh();
            }}
            variant="quiet"
          />}
          {boards.flatMap((board) => searchTitles.map((title, index) => (
            <DiscussionSearchLink
              board={board}
              key={`${board}-${title}`}
              label={`Search on /${board}/${searchTitles.length > 1 ? ` · ${index === 0 ? 'Title' : 'Romaji'}` : ''}`}
              title={title}
            />
          )))}
        </View>
      </Sheet>
    </Section>
    </AnimatedView>
  );
}
