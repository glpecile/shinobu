import { View } from 'react-native';

import { Button } from '@/components/button';
import { unairedEpisodeLabel } from '@/features/log-media/series-next-episode';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import { useCatchUpControls, useQuickLogBusy } from '@/features/up-next/catch-up/state';
import { hasAired } from '@/lib/time/has-aired';
import type { NormalizedEpisode, NormalizedMediaItem } from '@/types/media';
import { episodeCode } from './episode-label';

/** Episode screens open the app-level chain, without navigating away mid-log. */
export function EpisodeLogButton({ item, season, number, episode, watched, className }: {
  item: NormalizedMediaItem;
  season: number;
  number: number;
  episode: NormalizedEpisode;
  watched: boolean;
  className?: string;
}) {
  const { openLog } = useCatchUpControls();
  const pending = useQuickLogBusy(item.id);
  const { writable, manual } = useLogTargetsSplit(item);
  if (writable.length === 0 && manual.length === 0) return null;
  const code = episodeCode(season, number);
  const aired = hasAired(episode.firstAired);
  return <View className={className}>
    <Button
      disabled={!aired}
      icon={<Button.Icon name={watched ? 'eye' : 'eye-outline'} />}
      label={aired ? watched ? 'Rewatch' : 'Mark as watched' : unairedEpisodeLabel(code, episode.firstAired)}
      loading={pending}
      morphLabel
      onPress={() => openLog({
        item, title: `Log ${code}`,
        description: `“${item.title}” — ${code}: ${episode.title}`,
        episodes: [{ season, number }],
      })}
    />
  </View>;
}
