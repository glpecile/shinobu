import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useState, type ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Button } from '@/components/button';
import { Rail } from '@/components/rail';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { SuspenseSection } from '@/components/suspense-section';
import { discussionBoards, type DiscussionBoard } from '@/lib/http/fourchan';
import { discussionSubreddit, subredditSearchTerm, type DiscussionSubreddit } from '@/lib/http/reddit';
import { openExternalUrl } from '@/lib/open-external-url';
import { useLinkHandoff } from '@/lib/open-external-url/use-link-handoff';
import { DURATION, EASE_OUT } from '@/lib/motion';
import {
  discussionQueryKeys,
  useDiscussionsQuery,
  useSuspenseRedditDiscussionsQuery,
} from '@/state/queries/discussions';
import { useAnimeByIdQuery } from '@/state/queries/anilist';
import { useAniListIdByTmdbQuery } from '@/state/queries/mapping';
import type { NormalizedMediaItem } from '@/types/media';
import { DiscussionCard } from './discussion-card';

const discussionFade = { from: { opacity: 0 }, to: { opacity: 1 } };

type Discussion = { key: string } & ComponentProps<typeof DiscussionCard>;

interface DiscussionChrome {
  boards: DiscussionBoard[];
  subreddit: DiscussionSubreddit;
  term: string;
  isFetching: boolean;
  onRefresh: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Renders nothing until a 4chan board or the subreddit returns a matching
 * thread. Reddit reads sit behind their own boundary, so 4chan cards show
 * while Reddit loads or fails. A rate-limited search shows no Reddit cards
 * until Refresh in the sheet.
 */
export function DiscussionSection({ item, episode }: {
  item: NormalizedMediaItem; episode?: { season: number; number: number };
}) {
  const [open, setOpen] = useState(false);
  const [redditAttempt, setRedditAttempt] = useState(0);
  const queryClient = useQueryClient();
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
  const redditKey = discussionQueryKeys.subreddit(subreddit, term);
  const redditFetching = useIsFetching({ queryKey: redditKey }) > 0;
  const fourchan = useDiscussionsQuery(boards, searchItem, episode?.season, episode?.number);
  const chrome: DiscussionChrome = {
    boards,
    subreddit,
    term,
    isFetching: fourchan.isFetching || redditFetching,
    onRefresh: () => {
      void fourchan.refetch();
      void queryClient.refetchQueries({ queryKey: redditKey });
      setRedditAttempt((attempt) => attempt + 1);
    },
    open,
    onOpenChange: setOpen,
  };
  const fourchanOnly = <DiscussionBody {...chrome} fade threads={fourchan.threads} />;
  return (
    <SuspenseSection animateFallback={false} errorFallback={fourchanOnly} fallback={fourchanOnly} resetKey={redditAttempt}>
      <RedditDiscussions
        {...chrome}
        episode={episode}
        fourchan={fourchan.threads}
        item={searchItem}
      />
    </SuspenseSection>
  );
}

function RedditDiscussions({ fourchan, item, episode, ...chrome }: DiscussionChrome & {
  fourchan: Discussion[]; item: NormalizedMediaItem; episode?: { season: number; number: number };
}) {
  const reddit = useSuspenseRedditDiscussionsQuery(chrome.subreddit, chrome.term, item, episode?.season, episode?.number);
  // 4chan cards already on screen in the fallback must not fade in again.
  return <DiscussionBody {...chrome} fade={fourchan.length === 0} threads={[...fourchan, ...reddit]} />;
}

function DiscussionBody({ threads, boards, subreddit, term, isFetching, onRefresh, open, onOpenChange, fade }: DiscussionChrome & {
  threads: Discussion[]; fade: boolean;
}) {
  const reducedMotion = useReducedMotion();
  if (threads.length === 0) return null;
  return (
    <AnimatedView style={fade ? {
      animationName: discussionFade,
      animationDuration: reducedMotion ? 1 : DURATION.swap,
      animationTimingFunction: EASE_OUT,
      animationFillMode: 'both',
    } : undefined}>
    <Section>
      <Section.Header>
        <Section.Title>Discussion</Section.Title>
        <View className="flex-1" />
        <Button
          icon={<Button.Icon name="ellipsis-horizontal" />}
          iconOnly
          label="Discussion options"
          loading={isFetching}
          onPress={() => onOpenChange(true)}
          size="sm"
          variant="quiet"
        />
      </Section.Header>
      <Rail contentContainerClassName="gap-4">
        {threads.map(({ key, ...preview }) => <DiscussionCard key={key} {...preview} />)}
      </Rail>
      <Sheet onClose={() => onOpenChange(false)} open={open}>
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
              onOpenChange(false);
              onRefresh();
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
