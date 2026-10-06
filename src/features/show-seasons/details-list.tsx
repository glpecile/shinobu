import type { ReactNode } from 'react';
import { View } from 'react-native';

import { List } from '@/components/List';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { useScrolledTitle } from '@/components/scrolled-title';
import { cn } from '@/lib/cn';
import { useListDisclosure } from '@/lib/use-list-disclosure';
import type { NormalizedSeason } from '@/types/media';

import { EpisodeRow, SeasonHeader, SeasonMarkRow, type SeasonActions } from './season-accordion';
import { seasonRows } from './season-rows';

export interface DetailsListProps {
  header: ReactNode;
  footer: ReactNode;
  onRefresh: () => Promise<unknown>;
}

interface EpisodeSection extends SeasonActions {
  heading: ReactNode;
  seasons: readonly NormalizedSeason[];
}

/** One vertical viewport, like the diary: no season owns a nested scroll view or mapped episode body. */
export function DetailsList({
  header,
  footer,
  onRefresh,
  episodeSection,
}: DetailsListProps & { episodeSection?: EpisodeSection }) {
  const { expanded, toggle } = useListDisclosure<number>();
  const { scrollY } = useScrolledTitle();
  const rows = episodeSection == null ? [] : seasonRows(episodeSection.seasons, expanded);

  return (
    <List
      style={{ flex: 1 }}
      data={rows}
      // Watched state and mapping callbacks can change without changing the catalogue rows.
      extraData={episodeSection}
      estimatedItemSize={72}
      getItemType={(row) => row.kind}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={
        <>
          {header}
          {episodeSection != null && (
            <View className="w-full max-w-4xl self-center px-6">{episodeSection.heading}</View>
          )}
        </>
      }
      ListFooterComponent={<>{footer}</>}
      onScroll={(event) => scrollY.set(event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
      renderScrollComponent={(props) => (
        <RefreshableScrollView {...props} onRefresh={onRefresh} spinnerBelowStatusBar />
      )}
      renderItem={({ item: row }) => {
        if (episodeSection == null) return null;
        let content: ReactNode;
        switch (row.kind) {
          case 'season':
            content = (
              <SeasonHeader
                season={row.season}
                open={row.open}
                onToggle={() => toggle(row.season.number)}
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
                className={cn('border-x border-border', row.last && 'rounded-b-lg overflow-hidden mb-3')}
              >
                <EpisodeRow
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
        return <View className="w-full max-w-4xl self-center px-6">{content}</View>;
      }}
    />
  );
}
