import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PressableCard } from '@/components/pressable-card';
import { useNewTabPress } from '@/components/use-new-tab-press';
import type { NormalizedMediaItem } from '@/types/media';

/** A list is a collection, not a film: a strip of posters keeps the two distinct. */
export function ListCard({ list, count: itemCount, noun = 'film', href, onPress }: {
  list: { title: string; owner: string; previews: NormalizedMediaItem[] };
  count?: number;
  noun?: 'film' | 'item';
  href: string;
  onPress: () => void;
}) {
  const newTab = useNewTabPress(href);
  const count = itemCount == null ? '' : `${itemCount.toLocaleString()} ${noun}${itemCount === 1 ? '' : 's'} · `;
  return (
    <View onPointerDown={newTab.onPointerDown}>
      <PressableCard
        accessibilityLabel={`${list.title}. ${count}by ${list.owner}`}
        accessibilityRole="button"
        cardClassName="h-48"
        onPress={() => { if (!newTab.opened()) onPress(); }}
      >
        <View className="flex-row gap-1 h-28 overflow-hidden rounded-md mb-3">
          {list.previews.length === 0 ? <PosterPlaceholder className="flex-1 border-0" /> : list.previews.map((film, index) => (
            <View className="flex-1 bg-background" key={`${film.id}/${index}`}>
              {film.coverImage === '' ? <PosterPlaceholder className="w-full h-full border-0" /> : (
                <Image className="w-full h-full" contentFit="cover" source={{ uri: film.coverImage }} />
              )}
            </View>
          ))}
        </View>
        <Text className="font-sans-semibold text-foreground text-sm" numberOfLines={1}>{list.title}</Text>
        <Text className="font-sans text-muted text-xs mt-1" numberOfLines={1}>{`${count}by ${list.owner}`}</Text>
      </PressableCard>
    </View>
  );
}
