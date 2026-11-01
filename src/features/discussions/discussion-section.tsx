import { useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Button } from '@/components/button';
import { Rail } from '@/components/rail';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { discussionBoards } from '@/lib/http/fourchan';
import { discussionSubreddit, subredditSearchTerm } from '@/lib/http/reddit';
import { openExternalUrl } from '@/lib/open-external-url';
import { useLinkHandoff } from '@/lib/open-external-url/use-link-handoff';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useDiscussionsQuery } from '@/state/queries/discussions';
import { useAnimeByIdQuery } from '@/state/queries/anilist';
import { useAniListIdByTmdbQuery } from '@/state/queries/mapping';
import type { NormalizedMediaItem } from '@/types/media';
import { DiscussionCard } from './discussion-card';

const discussionFade = { from: { opacity: 0 }, to: { opacity: 1 } };

/** Renders nothing until a board returns a matching thread. */
export function DiscussionSection({ item, episode }: {
  item: NormalizedMediaItem; episode?: { season: number; number: number };
}) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
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
  const subreddit = discussionSubreddit(searchItem);
  const term = subredditSearchTerm(searchItem, subreddit);
  const { threads, isFetching, refetch } = useDiscussionsQuery(
    boards, { subreddit, term }, searchItem, episode?.season, episode?.number,
  );
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
        <Button
          icon={<Button.Icon name="ellipsis-horizontal" />}
          iconOnly
          label="Discussion options"
          loading={isFetching}
          onPress={() => setOpen(true)}
          size="sm"
          variant="quiet"
        />
      </Section.Header>
      <Rail contentContainerClassName="gap-4">
        {threads.map(({ key, ...preview }) => <DiscussionCard key={key} {...preview} />)}
      </Rail>
      <Sheet onClose={() => setOpen(false)} open={open}>
        <Sheet.Header className="items-center">
          <Text className="font-display text-xl text-foreground">Discussion options</Text>
        </Sheet.Header>
        <View className="mt-5 gap-2">
          <Button
            align="start"
            icon={<Button.Icon name="refresh" />}
            label="Refresh discussions"
            loading={isFetching}
            loadingLabel="Refreshing discussions"
            onPress={() => {
              setOpen(false);
              void refetch();
            }}
            variant="quiet"
          />
          {boards.map((board) => (
            <DiscussionLink
              accessibilityLabel={`Open 4chan /${board}/ catalog`}
              key={board}
              label={`/${board}/`}
              url={`https://boards.4chan.org/${board}/catalog`}
            />
          ))}
          <DiscussionLink
            accessibilityLabel={`Search r/${subreddit} on Reddit`}
            label={`r/${subreddit}`}
            url={`https://www.reddit.com/r/${subreddit}/search/?q=${encodeURIComponent(term)}&restrict_sr=on&sort=new`}
          />
        </View>
      </Sheet>
    </Section>
    </AnimatedView>
  );
}

function DiscussionLink({ label, url, accessibilityLabel }: { label: string; url: string; accessibilityLabel: string }) {
  const { loading, open } = useLinkHandoff(() => openExternalUrl(url, { inApp: false }));
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      align="start"
      icon={<Button.Icon name="open-outline" />}
      label={`Open ${label}`}
      loading={loading}
      loadingLabel={`Opening ${label}`}
      onPress={open}
      variant="quiet"
    />
  );
}
