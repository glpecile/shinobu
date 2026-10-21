import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { css, useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { List } from '@/components/List';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { useScrolledTitle } from '@/components/scrolled-title';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useListDisclosure } from '@/lib/use-list-disclosure';
import type { NormalizedSeason } from '@/types/media';

import { EpisodeRow, SeasonHeader, SeasonMarkRow, type SeasonActions } from './season-accordion';
import { seasonRows, type SeasonRow } from './season-rows';

export interface DetailsListProps {
  header: ReactNode;
  footer: ReactNode;
  onRefresh: () => Promise<unknown>;
}

interface EpisodeSection extends SeasonActions {
  heading: ReactNode;
  seasons: readonly NormalizedSeason[];
}

/**
 * Rows below a toggled season snap; only the opened season's rows unfold.
 * Legend List positions rows over several commits, so any transition on the
 * rows below (`LayoutAnimation`, `itemLayoutAnimation`) slid them from stale
 * estimates and left a gap on close.
 */
const UNFOLD = css.keyframes({
  from: { opacity: 0, transform: [{ translateY: -6 }] },
  to: { opacity: 1, transform: [{ translateY: 0 }] },
});
const UNFOLD_FADE = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
/** Rows past this are below the fold when a season opens. */
const UNFOLD_ROWS = 10;
const UNFOLD_STAGGER = 20;
const FOOTER_ROW = { kind: 'footer', key: 'footer' } as const;

/** One vertical viewport, like the diary: no season owns a nested scroll view or mapped episode body. */
export function DetailsList({
  header,
  footer,
  onRefresh,
  episodeSection,
}: DetailsListProps & { episodeSection?: EpisodeSection }) {
  const { expanded, toggle } = useListDisclosure<number>();
  const { scrollY } = useScrolledTitle();
  const reduceMotion = useReducedMotion();
  // The season whose rows play the unfold. Cleared once the user scrolls, so
  // rows re-mounting into view never replay it
  // (docs/solutions/entering-animation-on-virtualized-cells-replays.md).
  const [unfolding, setUnfolding] = useState<number | null>(null);
  function toggleSeason(season: number) {
    setUnfolding(expanded.has(season) ? null : season);
    toggle(season);
  }
  const rows: (SeasonRow | typeof FOOTER_ROW)[] = [
    ...(episodeSection == null ? [] : seasonRows(episodeSection.seasons, expanded, episodeSection.isEpisodeAired)),
    FOOTER_ROW,
  ];

  return (
    <List
      style={{ flex: 1 }}
      data={rows}
      // Watched state, mapping callbacks and the footer (which sharpens once
      // the item's TMDB id resolves) can change without changing the rows.
      extraData={[episodeSection, footer, unfolding]}
      // Between the mark row (~50) and a phone's wrapped episode rows (~80-100):
      // until a season has opened once, every row lands at this guess first.
      estimatedItemSize={72}
      getItemType={(row) => row.kind}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={
        <View>
          {header}
          {episodeSection != null && (
            <View className="w-full max-w-4xl self-center px-6">{episodeSection.heading}</View>
          )}
        </View>
      }
      onScroll={(event) => {
        scrollY.set(event.nativeEvent.contentOffset.y);
        if (unfolding != null) setUnfolding(null);
      }}
      onScrollBeginDrag={() => setUnfolding(null)}
      scrollEventThrottle={16}
      renderScrollComponent={(props) => (
        <RefreshableScrollView {...props} onRefresh={onRefresh} spinnerBelowStatusBar />
      )}
      renderItem={({ item: row }) => {
        if (row.kind === 'footer') return footer;
        if (episodeSection == null) return null;
        let content: ReactNode;
        switch (row.kind) {
          case 'season':
            content = (
              <SeasonHeader
                season={row.season}
                open={row.open}
                first={row.season === episodeSection.seasons[0]}
                onToggle={() => toggleSeason(row.season.number)}
              />
            );
            break;
          case 'mark':
            content = (
              <View className="border-x border-border">
                <SeasonMarkRow onPress={() => episodeSection.onMarkSeason(row.season)} />
              </View>
            );
            break;
          case 'episode':
            content = (
              <View
                className={cn('border-x border-border', row.last && 'rounded-b-lg overflow-hidden')}
              >
                <EpisodeRow
                  aired={episodeSection.isEpisodeAired?.(row.episode)}
                  season={row.season}
                  episode={row.episode}
                  isWatched={episodeSection.watched?.has(`${row.season.number}-${row.episode.number}`) === true}
                  onActions={
                    episodeSection.onEpisodeActions == null
                      ? undefined
                      : () => episodeSection.onEpisodeActions?.(row.season, row.episode)
                  }
                  onMark={() => episodeSection.onMarkEpisode(row.season, row.episode)}
                  onOpen={
                    episodeSection.onOpenEpisode == null
                      ? undefined
                      : () => episodeSection.onOpenEpisode?.(row.season, row.episode)
                  }
                />
              </View>
            );
        }
        const order = row.kind === 'mark' ? 0 : row.kind === 'episode' ? row.index + 1 : UNFOLD_ROWS;
        return (
          <AnimatedView
            className="w-full max-w-4xl self-center px-6"
            style={row.season.number === unfolding && order < UNFOLD_ROWS ? {
              animationName: reduceMotion ? UNFOLD_FADE : UNFOLD,
              animationDuration: DURATION.swap,
              animationDelay: order * UNFOLD_STAGGER,
              animationFillMode: 'backwards',
              animationTimingFunction: EASE_OUT,
            } : undefined}
          >
            {content}
          </AnimatedView>
        );
      }}
    />
  );
}
