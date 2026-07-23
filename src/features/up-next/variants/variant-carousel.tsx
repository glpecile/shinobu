import { ScrollView, View } from 'react-native';

import {
  calendarBadges,
  continueWatchingBadges,
} from '@/features/up-next/badges';
import type { UpNextEntry } from '@/features/up-next/types';
import { useUpNextSections } from '@/features/up-next/use-up-next-sections';
import { EpisodeCard } from '@/features/up-next/ui/episode-card';
import { QuickLogButton } from '@/features/up-next/ui/quick-log-button';
import {
  UpNextSectionHeader,
  VariantLabel,
} from '@/features/up-next/ui/section-header';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * Variant A (plan 0019 U6) — the reference treatment: one horizontal row of
 * landscape cards per section. A plain `ScrollView` like `media-carousel`,
 * not the List wrapper: the pool is capped at ~20 entries, so there is nothing
 * to virtualize.
 */
export interface UpNextVariantProps {
  onItemPress: (item: NormalizedMediaItem) => void;
  onItemActions: (item: NormalizedMediaItem) => void;
}

export function UpNextCarouselVariant({
  onItemPress,
  onItemActions,
}: UpNextVariantProps) {
  const { continueWatching, calendar, now } = useUpNextSections();
  if (continueWatching.length === 0 && calendar.length === 0) return null;

  const renderRow = (entries: UpNextEntry[], quickLog: boolean) => (
    <ScrollView horizontal className="px-4" showsHorizontalScrollIndicator={false}>
      {entries.map((entry) => (
        // Keyed by *item*, not entry: a quick-log advance then re-renders the
        // same card with a new episode, which is what MorphText animates.
        <View key={entry.item.id} className="mr-3">
          <EpisodeCard
            action={quickLog ? <QuickLogButton entry={entry} /> : undefined}
            badges={
              quickLog
                ? continueWatchingBadges(entry, now)
                : calendarBadges(entry, now)
            }
            entry={entry}
            onActionsPress={onItemActions}
            onPress={onItemPress}
          />
        </View>
      ))}
    </ScrollView>
  );

  return (
    <View>
      <VariantLabel text="Variant A — Carousel" />
      {continueWatching.length > 0 && (
        <UpNextSectionHeader
          collapseKey="up-next-variant-a-continue"
          title="Continue Watching"
        >
          {renderRow(continueWatching, true)}
        </UpNextSectionHeader>
      )}
      {calendar.length > 0 && (
        <UpNextSectionHeader
          collapseKey="up-next-variant-a-calendar"
          title="Calendar"
        >
          {renderRow(calendar, false)}
        </UpNextSectionHeader>
      )}
    </View>
  );
}
