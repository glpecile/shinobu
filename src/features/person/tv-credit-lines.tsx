import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Collapse } from '@/components/collapse';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PresstableOpacity } from '@/components/presstable';
import { episodeCode } from '@/features/episode-details/episode-label';
import { cn } from '@/lib/cn';
import { usePushRoute } from '@/lib/navigation';
import type { TvCredit } from '@/lib/providers/tmdb/normalize';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import { useDisclosureToggle } from '@/lib/use-disclosure-toggle';
import { usePrefetchTmdbEpisode, useTmdbCreditEpisodesQuery } from '@/state/queries/tmdb';
import type { NormalizedMediaItem } from '@/types/media';

import { creditRoleLine } from './person-credit-sheet';

/**
 * A person's credits on one show, one line each with its episode count
 * ("Director · 5 episodes"). A line opens to its episodes, and each episode
 * opens its screen. `onNavigate` closes the host sheet before the push.
 */
export function TvCreditLines({
  show,
  credits,
  onNavigate,
}: {
  show: NormalizedMediaItem;
  credits: readonly TvCredit[];
  onNavigate: () => void;
}) {
  return (
    <View className="mt-2">
      {credits.map((credit) => (
        <TvCreditLine credit={credit} key={credit.creditId} onNavigate={onNavigate} show={show} />
      ))}
    </View>
  );
}

function TvCreditLine({
  show,
  credit,
  onNavigate,
}: {
  show: NormalizedMediaItem;
  credit: TvCredit;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useDisclosureToggle(() => setOpen(!open));
  const counted = credit.episodeCount != null;
  const episodes = useTmdbCreditEpisodesQuery({ creditId: credit.creditId, enabled: counted });
  // TMDB ties a series regular to only a few of their episodes (Cranston:
  // 3 of 62), so a list is shown only when it accounts for every episode.
  const listed = episodes.data?.length === credit.episodeCount ? episodes.data : null;
  const role = creditRoleLine({ role: credit.label, kind: credit.kind });
  const label = counted
    ? `${role} · ${credit.episodeCount} ${credit.episodeCount === 1 ? 'episode' : 'episodes'}`
    : role;

  if (listed == null) {
    // Same height as the disclosure, so the line doesn't grow when the list lands.
    return (
      <View className={cn(counted && 'min-h-11', 'justify-center')}>
        <Text className="text-foreground font-sans text-sm">{label}</Text>
      </View>
    );
  }

  return (
    <View>
      <PresstableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="min-h-11 flex-row items-center gap-2"
        onPress={toggle}
        pressBehavior="immediate"
      >
        <Text className="flex-1 text-foreground font-sans text-sm">{label}</Text>
        <DisclosureChevron open={open} size={16} />
      </PresstableOpacity>
      <Collapse open={open}>
        {listed.map((episode) => (
          <EpisodeLink
            episode={episode}
            key={`${episode.season}-${episode.number}`}
            onNavigate={onNavigate}
            show={show}
          />
        ))}
      </Collapse>
    </View>
  );
}

function EpisodeLink({
  show,
  episode,
  onNavigate,
}: {
  show: NormalizedMediaItem;
  episode: { season: number; number: number; title: string };
  onNavigate: () => void;
}) {
  const pushRoute = usePushRoute();
  const prefetchEpisode = usePrefetchTmdbEpisode();
  const muted = useThemeColor('--color-muted');
  const code = episodeCode(episode.season, episode.number);
  return (
    <PresstableOpacity
      accessibilityHint="Opens the episode"
      accessibilityLabel={episode.title === '' ? code : `${code}, ${episode.title}`}
      accessibilityRole="button"
      className="min-h-11 flex-row items-center gap-3 pl-3"
      onPress={() => {
        prefetchEpisode({ tmdbId: show.externalIds.tmdb, season: episode.season, number: episode.number });
        onNavigate();
        pushRoute(routes.episode(show.id, episode.season, episode.number));
      }}
    >
      <Text className="text-muted font-sans text-sm">{code}</Text>
      <Text className="flex-1 text-foreground font-sans text-sm" numberOfLines={1}>
        {episode.title}
      </Text>
      <Ionicons accessible={false} color={muted} name="chevron-forward" size={16} />
    </PresstableOpacity>
  );
}
