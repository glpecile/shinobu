import { useState } from 'react';
import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { progressLabel } from '@/components/media-card';
import { MorphText } from '@/components/morph-text';
import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableScale } from '@/components/presstable';
import { ReadingLogButton } from '@/features/log-media/reading-log-button';
import { percentRead } from '@/features/log-media/reading-share';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { usePrefetchMediaDetails } from '@/state/queries/media-details';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * "Ch 12 / 59", a book's "p. 26 / 204" or "13%" in the reader's unit, or the
 * length before the first log: a reading row never says "not started".
 */
function readingProgress(item: NormalizedMediaItem, inPages: boolean): string {
  const total = item.totalEpisodes;
  if (item.progressUnit === 'page' && !inPages && item.currentProgress > 0 && total != null && total > 0) {
    return `${percentRead(item.currentProgress, total)}%`;
  }
  const progress = progressLabel(item);
  if (progress != null) return progress;
  if (total == null || total <= 0) return '';
  const unit = item.progressUnit === 'page' ? 'page' : 'chapter';
  return `${total.toLocaleString()} ${unit}${total === 1 ? '' : 's'}`;
}

/**
 * A Continue Reading card: the Up Next card's layout (art, then title and
 * progress below it) around a tall cover, which a landscape crop would cut.
 * The log button sits on the cover because the card is too narrow to put it
 * beside the title.
 */
export function ReadingCard({
  item,
  inPages,
  onActionsPress,
}: {
  item: NormalizedMediaItem;
  /** The reader's unit for book progress, read once by the row. */
  inPages: boolean;
  onActionsPress: (item: NormalizedMediaItem) => void;
}) {
  const title = item.title.trim() || 'Untitled';
  const progress = readingProgress(item, inPages);
  const pushRoute = usePushRoute();
  const prefetchDetails = usePrefetchMediaDetails();
  const [hovered, setHovered] = useState(false);

  return (
    <View className="w-32">
      {/* The buttons are siblings of the pressable so their press can't open details. */}
      <View
        className="w-32 h-48"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <PresstableScale
          accessibilityLabel={[title, progress].filter(Boolean).join(', ')}
          accessibilityRole="button"
          className="w-32 h-48"
          // A smaller shrink than the default, so the cover stays under the buttons on it.
          minScale={0.98}
          onLongPress={() => onActionsPress(item)}
          onPress={() => {
            prefetchDetails(item);
            pushRoute(routes.details(item.id, item.type));
          }}
        >
          <View className="w-32 h-48 rounded-lg overflow-hidden border border-border/50">
            <PosterPlaceholder className="absolute inset-0 border-0" />
            {item.coverImage !== '' && (
              <Image className="absolute inset-0" contentFit="cover" source={{ uri: item.coverImage }} />
            )}
          </View>
        </PresstableScale>
        <View className="absolute bottom-2 right-2">
          <ReadingLogButton item={item} />
        </View>
        {process.env.EXPO_OS === 'web' && (
          <OverlayActionsButton
            className="absolute top-2 right-2"
            label={`More options for ${title}`}
            onPress={() => onActionsPress(item)}
            size="md"
            visible={hovered}
          />
        )}
      </View>
      <Text className="text-foreground font-sans-semibold text-sm leading-tight mt-2" numberOfLines={1}>
        {title}
      </Text>
      <MorphText className="text-muted font-sans text-xs mt-0.5" numberOfLines={1}>
        {progress}
      </MorphText>
    </View>
  );
}
