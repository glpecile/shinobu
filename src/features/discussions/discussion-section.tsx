import { useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Button } from '@/components/button';
import { Rail } from '@/components/rail';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { discussionBoards, type DiscussionBoard } from '@/lib/http/fourchan';
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
  return <DiscussionResults boards={boards} isFetching={isFetching} onRefresh={refetch} threads={threads} />;
}

function DiscussionBoardLink({ board }: { board: DiscussionBoard }) {
  const { loading, open } = useLinkHandoff(() => openExternalUrl(`https://boards.4chan.org/${board}/catalog`, { inApp: false }));
  return (
    <Button
      accessibilityLabel={`Open 4chan /${board}/ catalog`}
      align="start"
      icon={<Button.Icon name="open-outline" />}
      label={`Open /${board}/`}
      loading={loading}
      loadingLabel={`Opening /${board}/`}
      onPress={open}
      variant="quiet"
    />
  );
}

/** Shared by details and the dev preview, including the hidden empty state. */
export function DiscussionResults({ threads, boards, isFetching = false, onRefresh }: {
  threads: { board: DiscussionBoard; thread: DiscussionPreview }[];
  boards: DiscussionBoard[];
  isFetching?: boolean;
  onRefresh?: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  if (threads.length === 0) return null;
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
        {(onRefresh != null || boards.length > 0) && (
          <Button
            icon={<Button.Icon name="ellipsis-horizontal" />}
            iconOnly
            label="Discussion options"
            loading={isFetching}
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
          {boards.map((board) => <DiscussionBoardLink board={board} key={board} />)}
        </View>
      </Sheet>
    </Section>
    </AnimatedView>
  );
}
