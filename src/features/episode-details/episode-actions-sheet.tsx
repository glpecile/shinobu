import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { hasAired } from '@/lib/time/has-aired';
import type { NormalizedEpisode, NormalizedMediaItem } from '@/types/media';

import { episodeCode, episodeMetaLine } from './episode-label';
import { EpisodeLogs, EpisodeStill } from './episode-sections';
import { useEpisode } from './use-episode';
import { useEpisodeLogs } from './use-episode-logs';

/**
 * Which row was long-pressed — kept (not nulled) while the sheet closes.
 * `season`/`number` are the **tracker's** (TMDB/Trakt) numbering, which for an
 * anime entry differs from the row's own entry-relative number; `episode` is
 * the row as listed, for instant title/overview/air date.
 */
export interface EpisodePointer {
  season: number;
  number: number;
  episode: NormalizedEpisode;
}

interface EpisodeActionsSheetProps {
  item: NormalizedMediaItem;
  pointer: EpisodePointer | null;
  watched: boolean;
  open: boolean;
  onClose: () => void;
  /** Opens the shared confirm sheet for this episode (the parent owns it). */
  onMark: () => void;
}

function SheetBody({
  item,
  pointer,
  watched,
  onClose,
  onMark,
}: Omit<EpisodeActionsSheetProps, 'open' | 'pointer'> & { pointer: EpisodePointer }) {
  const pushRoute = usePushRoute();
  const { season, number } = pointer;
  // The row already holds title/overview; this only adds the still and TMDB's
  // fuller text, and warms the episode screen's cache for the "View" row.
  const view = useEpisode(item, season, number);
  const episode = view.episode ?? pointer.episode;
  const logs = useEpisodeLogs(item, season, number, episode.firstAired);
  const aired = hasAired(episode.firstAired);
  const meta = episodeMetaLine(episode);

  return (
    <>
      {/* Same header shape as the card-actions sheet: artwork beside the
          title, one muted line under it, so the long-press dialogs read as
          one control. The full title wraps here — the row's clamp is the
          reason this sheet exists. */}
      <View className="flex-row items-center gap-4">
        <EpisodeStill className="w-32 rounded" title={episode.title} uri={view.still} />
        <View className="flex-1">
          <Text className="text-accent text-xs font-sans-semibold uppercase tracking-wider">
            {episodeCode(season, number)}
          </Text>
          <Text className="text-2xl font-display text-foreground" numberOfLines={3}>
            {episode.title}
          </Text>
          {meta !== '' && (
            <Text className="text-muted font-sans text-sm mt-1">{meta}</Text>
          )}
        </View>
      </View>

      <EpisodeLogs className="mt-4" logs={logs} />

      {episode.overview != null && (
        <Text
          className="text-foreground/90 font-sans text-sm leading-relaxed mt-4"
          numberOfLines={4}
        >
          {episode.overview}
        </Text>
      )}

      <View className="mt-5">
        {aired ? (
          <Button
            icon={<Button.Icon name={watched ? 'refresh' : 'checkmark'} />}
            label={watched ? 'Rewatch' : 'Mark as watched'}
            onPress={onMark}
          />
        ) : (
          <Text className="text-muted font-sans text-sm">
            Not aired yet — it can be logged once it&apos;s out.
          </Text>
        )}
      </View>

      <Button
        className="mt-4"
        icon={<Button.Icon name="open-outline" />}
        label="View episode"
        onPress={() => {
          onClose();
          pushRoute(routes.episode(item.id, season, number));
        }}
        variant="quiet"
      />
    </>
  );
}

/**
 * The long-press dialog behind a season-accordion row — the same shape as the
 * card-actions and credit sheets: what you grabbed (still, code, unclamped
 * title), whether and where it's logged, the overview, the one write the row
 * offers, and the route to the full episode screen one row away.
 */
export function EpisodeActionsSheet({
  item,
  pointer,
  watched,
  open,
  onClose,
  onMark,
}: EpisodeActionsSheetProps) {
  return (
    <Sheet onClose={onClose} open={open && pointer != null}>
      {pointer != null && (
        <SheetBody
          item={item}
          key={`${pointer.season}-${pointer.number}`}
          onClose={onClose}
          onMark={onMark}
          pointer={pointer}
          watched={watched}
        />
      )}
    </Sheet>
  );
}
