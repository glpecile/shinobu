import { LinearGradient } from 'expo-linear-gradient';
import { Link, type Href } from 'expo-router';
import { useState } from 'react';
// oxlint-disable-next-line no-restricted-imports -- iOS Link needs a cancellable press event; pressto emits animation options. The shared route guard still debounces navigation.
import { Pressable } from 'react-native';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Image } from '@/components/image';
import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableScale } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { useNewTabPress } from '@/components/use-new-tab-press';
import { cn } from '@/lib/cn';
import { allowRoutePush, usePreloadRoute, usePushRoute } from '@/lib/navigation';
import { sourceProviderOf } from '@/lib/providers/provider-links';
import { PROVIDERS } from '@/lib/providers/registry';
import { routes } from '@/lib/routes';
import { usePrefetchMediaDetails } from '@/state/queries/media-details';
import { useTraktMediaImages } from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';

interface MediaCardProps {
  item: NormalizedMediaItem;
  /** Layout only, including responsive poster dimensions. */
  className?: string;
  /** Extra context line under the type label (e.g. a person's character/job). */
  subtitle?: string;
  /** Opens quick log/hide via long-press or the web hover button. */
  onActionsPress: (item: NormalizedMediaItem) => void;
}

function progressLabel(item: NormalizedMediaItem): string | null {
  if (item.currentProgress === 0) return null;
  const hasTotal = item.totalEpisodes != null && item.totalEpisodes > 0;
  if (item.progressUnit === 'chapter') {
    return hasTotal ? `Ch ${item.currentProgress} / ${item.totalEpisodes}` : `Ch ${item.currentProgress}`;
  }
  return hasTotal ? `${item.currentProgress}/${item.totalEpisodes} ep` : `${item.currentProgress} ep`;
}

export function MediaCard({ item, className, subtitle, onActionsPress }: MediaCardProps) {
  const progress = progressLabel(item);
  const source = sourceProviderOf(item) ?? (item.id.startsWith('tmdb-') ? 'tmdb' : null);
  const sourceLabel = source == null ? null : source === 'tmdb' ? 'TMDB' : PROVIDERS[source].label;
  // Trakt's watched feed omits artwork; fetch it for visible cards.
  const { coverImage } = useTraktMediaImages(item);
  // Uniwind has no group-hover support.
  const [hovered, setHovered] = useState(false);
  const pushRoute = usePushRoute();
  const preloadRoute = usePreloadRoute();
  const reduceMotion = useReducedMotion();
  const [displayedUri, setDisplayedUri] = useState<string | null>(null);
  const zoom = process.env.EXPO_OS === 'ios' && !reduceMotion && coverImage !== '' && displayedUri === coverImage;
  const href = routes.details(item.id, item.type);

  const newTab = useNewTabPress(href);
  const prefetchDetails = usePrefetchMediaDetails();

  function onCardPress() {
    if (newTab.opened()) return;
    prefetchDetails(item);
    pushRoute(href);
  }

  const poster = coverImage !== '' ? (
    <Image
      source={{ uri: coverImage }}
      className="w-full h-full ios:rounded-lg"
      contentFit="cover"
      {...(process.env.EXPO_OS === 'ios' ? { transition: 0 } : {})}
      onDisplay={process.env.EXPO_OS === 'ios' ? () => setDisplayedUri(coverImage) : undefined}
      onError={process.env.EXPO_OS === 'ios' ? () => setDisplayedUri(null) : undefined}
    />
  ) : (
    <PosterPlaceholder className="w-full h-full border-0" />
  );

  const content = (
    <View className="w-full h-full rounded-lg overflow-hidden border border-border/50">
      {zoom ? <Link.AppleZoom>{poster}</Link.AppleZoom> : poster}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 112 }}
      />
      {/* Keep text light over the dark scrim in both themes. */}
      <View className="absolute bottom-0 left-0 right-0 p-3">
        <Text
          className="text-accent-foreground font-sans-semibold text-sm leading-tight"
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View className="flex-row items-center mt-1.5">
          <Text className="text-accent-foreground/70 text-xs font-sans flex-1" numberOfLines={1}>
            {item.type}{progress != null ? ` · ${progress}` : ''}
          </Text>
          {source != null && <View className="ml-2"><ProviderIcon id={source} size={12} /></View>}
        </View>
        {subtitle != null && subtitle !== '' && (
          <Text
            className="text-accent-foreground/70 text-xs font-sans mt-0.5"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
  const pressProps = {
    accessibilityLabel: [item.title, item.type, progress, subtitle, sourceLabel].filter(Boolean).join(' · '),
    onLongPress: () => onActionsPress(item),
    onPressIn: () => preloadRoute(href),
    className: 'w-full h-full',
  };

  return (
    // Keep the actions button separate so its press cannot open details.
    <View
      className={cn('w-40 h-60 relative', className)}
      onPointerDown={newTab.onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {process.env.EXPO_OS === 'ios' ? (
        <Link
          asChild
          push
          href={routes.details(item.id, item.type, zoom ? coverImage : undefined) as Href}
          onPress={(event) => {
            if (!allowRoutePush(href)) event.preventDefault();
            else prefetchDetails(item);
          }}
        >
          <Pressable
            {...pressProps}
            accessibilityRole="link"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            {content}
          </Pressable>
        </Link>
      ) : (
        <PresstableScale {...pressProps} accessibilityRole="button" onPress={onCardPress}>
          {content}
        </PresstableScale>
      )}
      {process.env.EXPO_OS === 'web' && (
        <OverlayActionsButton
          className="absolute top-2 right-2"
          label={`More options for ${item.title}`}
          onPress={() => onActionsPress(item)}
          size="md"
          visible={hovered}
        />
      )}
    </View>
  );
}
