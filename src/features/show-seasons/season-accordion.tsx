import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { hasAired } from '@/lib/time/has-aired';
import type { NormalizedSeason } from '@/types/media';
import { formatRuntime, seasonRuntimeMinutes } from './runtime';

/** Pointer into a season/episode that the confirm sheet will mark watched. */
export interface PendingLog {
  /** Sheet title, e.g. "Mark season 1 as watched". */
  title: string;
  /** Sheet description, e.g. the episode/season label. */
  description: string;
  /** One or more episode watches fanned out in a single request. */
  episodes: Array<{ season: number; number: number }>;
}

export interface SeasonAccordionProps {
  season: NormalizedSeason;
  /** `"${season}-${number}"` watched keys, or null when Trakt isn't connected. */
  watched: ReadonlySet<string> | null;
  onMarkSeason: (season: NormalizedSeason) => void;
  onMarkEpisode: (
    season: NormalizedSeason,
    episode: NormalizedSeason['episodes'][number],
  ) => void;
}

/**
 * One expandable season on the TV detail screen (plan 0010). Tapping the
 * header toggles open; "Mark season as watched" and the per-episode buttons
 * route through the shared confirm sheet (the parent owns the mutation).
 * Watched episodes render a checkmark — the parent can pass `null` for the set
 * when Trakt is disconnected, in which case no checkmarks show. Episodes whose
 * `firstAired` is still in the future (parsed as an instant, compared in the
 * user's local timezone — `lib/time/has-aired.ts`) render distinct and can't
 * be logged: you can't mark an episode you couldn't have watched yet.
 */
export function SeasonAccordion({
  season,
  watched,
  onMarkSeason,
  onMarkEpisode,
}: SeasonAccordionProps) {
  const [open, setOpen] = useState(false);
  const accent = useCSSVariable('--color-accent');
  const muted = useCSSVariable('--color-muted');
  const foreground = useCSSVariable('--color-foreground');
  const runtime = seasonRuntimeMinutes(season);
  const accentColor = typeof accent === 'string' ? accent : undefined;
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  const foregroundColor = typeof foreground === 'string' ? foreground : undefined;

  const airedCount = season.episodes.filter((e) => hasAired(e.firstAired)).length;
  const seasonMarkable = airedCount > 0;

  return (
    <View className="border border-border rounded-lg mb-3 overflow-hidden">
      <View className="flex-row items-center">
        <PresstableOpacity
          className="flex-1 flex-row items-center px-4 py-3"
          onPress={() => setOpen(!open)}
        >
          <Ionicons
            color={mutedColor}
            name={open ? 'chevron-down' : 'chevron-forward'}
            size={16}
          />
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
        </PresstableOpacity>
      </View>

      {open && (
        <View className="border-t border-border">
          {seasonMarkable && (
            <PresstableOpacity
              className="flex-row items-center px-4 py-3 border-b border-border bg-accent/5"
              onPress={() => onMarkSeason(season)}
            >
              <Ionicons color={accentColor} name="checkmark-done" size={16} />
              <Text className="text-accent font-sans-semibold text-sm ml-2">
                Mark season as watched
              </Text>
            </PresstableOpacity>
          )}
          {season.episodes.map((episode) => {
            const isWatched =
              watched?.has(`${season.number}-${episode.number}`) === true;
            const aired = hasAired(episode.firstAired);
            return (
              <View
                className="flex-row items-center px-4 py-3 border-b border-border"
                key={episode.number}
              >
                {isWatched ? (
                  <Ionicons color={accentColor} name="checkmark-circle" size={16} />
                ) : (
                  <View className="w-4" />
                )}
                <View className="ml-3 flex-1">
                  <Text
                    className="font-sans text-sm"
                    numberOfLines={1}
                    style={{
                      color: aired ? foregroundColor : mutedColor,
                      opacity: aired ? 1 : 0.6,
                    }}
                  >
                    E{episode.number} · {episode.title}
                  </Text>
                  <Text className="text-muted font-sans text-xs mt-0.5">
                    {episode.runtime != null ? `${episode.runtime} min` : ''}
                    {episode.runtime != null && !aired ? ' · ' : ''}
                    {!aired ? 'Unaired' : ''}
                  </Text>
                </View>
                {aired ? (
                  <PresstableOpacity
                    className="px-3 py-1.5 rounded border border-border"
                    onPress={() => onMarkEpisode(season, episode)}
                  >
                    <Text
                      className="font-sans-semibold text-xs"
                      style={{ color: foregroundColor }}
                    >
                      {isWatched ? 'Rewatch' : 'Mark as watched'}
                    </Text>
                  </PresstableOpacity>
                ) : (
                  <Text className="text-muted font-sans text-xs px-3">Unaired</Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}