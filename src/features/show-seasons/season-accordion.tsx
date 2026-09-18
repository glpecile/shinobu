import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { LayoutAnimation, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Collapse } from '@/components/collapse';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PressableCard } from '@/components/pressable-card';
import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { formatAirDate } from '@/features/episode-details/episode-label';
import { DISCLOSURE_LAYOUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';
import { hasAired } from '@/lib/time/has-aired';
import { formatRelativeDay } from '@/lib/time/relative-day';
import type { NormalizedEpisode, NormalizedSeason } from '@/types/media';
import { formatRuntime, seasonRuntimeMinutes } from './runtime';

/** Pointer into a season/episode that the confirm sheet will mark watched. */
export interface PendingLog {
  /** Sheet title, e.g. "Mark season 1 as watched". */
  title: string;
  /** Sheet description, e.g. the episode/season label. */
  description: string;
  /**
   * Canonical `{season, number}` watches fanned out in a single request — the
   * TV/Trakt domain. Mutually exclusive with `entryEpisodes` (plan 0027 KTD2).
   */
  episodes?: Array<{ season: number; number: number }>;
  /**
   * AniList-entry-relative episode numbers, for the anime accordion: the entry
   * numbers its own episodes 1..n and carries no canonical season, so the log
   * fan-out translates them via ani.zip rather than the caller guessing.
   */
  entryEpisodes?: number[];
}

export interface SeasonAccordionProps {
  season: NormalizedSeason;
  /** `"${season}-${number}"` watched keys, or null when Trakt isn't connected. */
  watched: ReadonlySet<string> | null;
  onMarkSeason: (season: NormalizedSeason) => void;
  onMarkEpisode: (season: NormalizedSeason, episode: NormalizedEpisode) => void;
  /**
   * Row tap: the episode screen. Optional because the anime accordion's rows
   * are AniList-entry-relative with no canonical season to route to — its
   * rows stay plain.
   */
  onOpenEpisode?: (season: NormalizedSeason, episode: NormalizedEpisode) => void;
  /** Row long-press (web: the hover ⋯): the episode actions sheet. */
  onEpisodeActions?: (season: NormalizedSeason, episode: NormalizedEpisode) => void;
}

function EpisodeRow({
  season,
  episode,
  isWatched,
  onMark,
  onOpen,
  onActions,
}: {
  season: NormalizedSeason;
  episode: NormalizedEpisode;
  isWatched: boolean;
  onMark: () => void;
  onOpen?: (() => void) | undefined;
  onActions?: (() => void) | undefined;
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
  const aired = hasAired(episode.firstAired);
  // The row asks "when?" twice — meta line and mark-button slot — so it
  // answers with the date in one and the countdown in the other. No date at
  // all means a synthesized AniList row for an announced season, where the
  // bare word is all anyone knows.
  const airsOn =
    aired || episode.firstAired == null
      ? null
      : formatAirDate(episode.firstAired);
  const airsIn = aired ? null : formatRelativeDay(episode.firstAired);
  const meta = [
    episode.runtime != null ? `${episode.runtime} min` : null,
    aired ? null : (airsOn ?? 'Unaired'),
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
 * One expandable season on the TV detail screen (plan 0010). Tapping the
 * header toggles open; "Mark season as watched" and the per-episode buttons
 * route through the shared confirm sheet (the parent owns the mutation). A
 * row tap opens the episode screen and a long-press its actions sheet — the
 * row clamps the title to two lines, the sheet and screen never do.
 * Watched episodes render an eye — the parent can pass `null` for the set
 * when Trakt is disconnected, in which case no marks show. Episodes whose
 * `firstAired` is still in the future (parsed as an instant, compared in the
 * user's local timezone — `lib/time/has-aired.ts`) render distinct, say when
 * they land, and can't be logged: you can't mark an episode you couldn't have
 * watched yet.
 */
export function SeasonAccordion({
  season,
  watched,
  onMarkSeason,
  onMarkEpisode,
  onOpenEpisode,
  onEpisodeActions,
}: SeasonAccordionProps) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const accent = useThemeColor('--color-accent');
  const runtime = seasonRuntimeMinutes(season);

  function toggle() {
    if (!reduceMotion) LayoutAnimation.configureNext(DISCLOSURE_LAYOUT);
    setOpen(!open);
  }

  const airedCount = season.episodes.filter((e) => hasAired(e.firstAired)).length;
  const seasonMarkable = airedCount > 0;

  return (
    <View className="mb-3">
      <PressableCard
        accessibilityState={{ expanded: open }}
        cardClassName={cn('flex-row items-center', open && 'rounded-b-none')}
        onPress={toggle}
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

      <Collapse open={open}>
        <View className="border border-border border-t-0 rounded-b-lg overflow-hidden">
          {seasonMarkable && (
            <PresstableOpacity
              className="flex-row items-center px-4 py-3 border-b border-border bg-accent/5"
              onPress={() => onMarkSeason(season)}
            >
              <Ionicons color={accent} name="eye-outline" size={16} />
              <Text className="text-accent font-sans-semibold text-sm ml-2">
                Mark season as watched
              </Text>
            </PresstableOpacity>
          )}
          {season.episodes.map((episode) => (
            <EpisodeRow
              episode={episode}
              isWatched={watched?.has(`${season.number}-${episode.number}`) === true}
              key={episode.number}
              onActions={
                onEpisodeActions == null
                  ? undefined
                  : () => onEpisodeActions(season, episode)
              }
              onMark={() => onMarkEpisode(season, episode)}
              onOpen={
                onOpenEpisode == null ? undefined : () => onOpenEpisode(season, episode)
              }
              season={season}
            />
          ))}
        </View>
      </Collapse>
    </View>
  );
}