import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PressableCard } from '@/components/pressable-card';
import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { formatAirDate } from '@/features/episode-details/episode-label';
import { useThemeColor } from '@/lib/theme-color';
import { hasAired } from '@/lib/time/has-aired';
import { formatRelativeDay } from '@/lib/time/relative-day';
import type { NormalizedEpisode, NormalizedSeason } from '@/types/media';
import type { LogRequest } from '@/features/log-media/log-request';
import { formatRuntime, seasonRuntimeMinutes } from './runtime';

/** Pointer into a season/episode that the confirm sheet will mark watched. */
export type PendingLog = Omit<LogRequest, 'item' | 'entry'>;

export interface SeasonActions {
  /** Anime can prove an undated episode aired from its catalogue evidence. */
  isEpisodeAired?: (episode: NormalizedEpisode) => boolean;
  /** `"${season}-${number}"` watched keys; anime uses entry-relative season 1. */
  watched: ReadonlySet<string> | null;
  onMarkSeason: (season: NormalizedSeason) => void;
  onMarkEpisode: (season: NormalizedSeason, episode: NormalizedEpisode) => void;
  /**
   * Row tap opens episode details. Without a canonical mapping, anime rows
   * remain display-only while their logging buttons still work.
   */
  onOpenEpisode?: (season: NormalizedSeason, episode: NormalizedEpisode) => void;
  /** Row long-press (web: the hover ⋯): the episode actions sheet. */
  onEpisodeActions?: (season: NormalizedSeason, episode: NormalizedEpisode) => void;
}

export function EpisodeRow({
  season,
  episode,
  isWatched,
  onMark,
  onOpen,
  onActions,
  aired = hasAired(episode.firstAired),
}: {
  season: NormalizedSeason;
  episode: NormalizedEpisode;
  isWatched: boolean;
  onMark: () => void;
  onOpen?: (() => void) | undefined;
  onActions?: (() => void) | undefined;
  aired?: boolean;
}) {
  const accent = useThemeColor('--color-accent');
  const muted = useThemeColor('--color-muted');
  const foreground = useThemeColor('--color-foreground');
  // JS hover state, not CSS: uniwind has no `group-hover:`, so the web-only
  // ⋯ reveal rides on RN-web's pointer events (the PersonCard pattern) —
  // long-press is not a discoverable web gesture.
  const [hovered, setHovered] = useState(false);
  const showActionsButton =
    process.env.EXPO_OS === 'web' && hovered && onActions != null;
  // Every known air date stays in the meta line; upcoming episodes also show
  // a countdown in the mark-button slot. No date at
  // all on an unstarted season leaves only the bare word; released catalogue
  // gaps stay loggable without displaying a fabricated date.
  const airsOn = episode.firstAired == null ? null : formatAirDate(episode.firstAired);
  const airsIn = aired ? null : formatRelativeDay(episode.firstAired);
  const meta = [
    episode.runtime != null ? `${episode.runtime} min` : null,
    airsOn ?? (aired ? null : 'Unaired'),
  ]
    .filter((part) => part != null)
    .join(' · ');
  const label = (
    <>
      {isWatched ? (
        <Ionicons color={accent} name="eye" size={16} />
      ) : (
        <View className="w-4" />
      )}
      <View className="ml-3 flex-1 pr-3">
        <Text
          className="font-sans text-sm"
          numberOfLines={2}
          style={{
            color: aired ? foreground : muted,
            opacity: aired ? 1 : 0.6,
          }}
        >
          E{episode.number} · {episode.title}
        </Text>
        <Text className="text-muted font-sans text-xs mt-0.5">{meta}</Text>
      </View>
    </>
  );

  return (
    // The mark button and the ⋯ are *siblings* of the row pressable, not
    // children — nesting gesture-handler buttons lets a press bubble through.
    <View
      className="flex-row items-center pr-4 border-b border-border"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {onOpen == null ? (
        <View className="flex-1 flex-row items-center pl-4 py-3">{label}</View>
      ) : (
        <PresstableOpacity
          accessibilityLabel={`${season.title}, episode ${episode.number}: ${episode.title}`}
          className="flex-1 flex-row items-center pl-4 py-3"
          onLongPress={onActions}
          onPress={onOpen}
        >
          {label}
        </PresstableOpacity>
      )}
      {showActionsButton && (
        <PresstableOpacity
          accessibilityLabel={`More about episode ${episode.number}`}
          accessibilityRole="button"
          className="w-8 h-8 mr-2 items-center justify-center rounded-full"
          onPress={onActions}
        >
          <Ionicons color={muted} name="ellipsis-horizontal" size={16} />
        </PresstableOpacity>
      )}
      {aired ? (
        <Button
          icon={<Button.Icon name={isWatched ? 'eye' : 'eye-outline'} />}
          label={isWatched ? 'Rewatch' : 'Mark as watched'}
          morphLabel
          onPress={onMark}
          size="sm"
          variant="quiet"
        />
      ) : (
        <Text className="text-muted font-sans text-xs px-3">
          {airsIn ?? 'Unaired'}
        </Text>
      )}
    </View>
  );
}

/**
 * Controlled header: the screen's flat list owns expansion, not this cell.
 * The gap above it is its own, so toggling never changes its height and the
 * rows below never wait on a re-measure.
 */
export function SeasonHeader({
  season,
  open,
  first,
  onToggle,
}: {
  season: NormalizedSeason;
  open: boolean;
  first: boolean;
  onToggle: () => void;
}) {
  const runtime = seasonRuntimeMinutes(season);
  const hasBody = open && season.episodes.length > 0;

  return (
    <View className={cn(!first && 'mt-3')}>
      <PressableCard
        accessibilityState={{ expanded: open }}
        cardClassName={cn('flex-row items-center', hasBody && 'rounded-b-none')}
        onPress={onToggle}
        pressBehavior="immediate"
      >
        <DisclosureChevron from="forward" open={open} size={16} />
        <View className="ml-3 flex-1">
          <Text className="text-foreground font-sans-semibold text-base">
            {season.title}
          </Text>
          <Text className="text-muted font-sans text-xs mt-0.5">
            {season.episodes.length}{' '}
            {season.episodes.length === 1 ? 'episode' : 'episodes'}
            {runtime > 0 ? ` · ${formatRuntime(runtime)}` : ''}
          </Text>
        </View>
      </PressableCard>
    </View>
  );
}

/** A separate list row, so opening a season never mounts its whole body. */
export function SeasonMarkRow({ onPress }: { onPress: () => void }) {
  return (
    <View className="px-4 py-3 border-b border-border bg-accent/5">
      <Button
        align="start"
        className="self-start"
        icon={<Button.Icon name="eye-outline" />}
        label="Mark season as watched"
        onPress={onPress}
        size="sm"
        variant="quiet"
      />
    </View>
  );
}
