import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PressableCard } from '@/components/pressable-card';
import { useNewTabPress } from '@/components/use-new-tab-press';
import type { LetterboxdList } from '@/lib/providers/letterboxd/lists';
import { routes } from '@/lib/routes';

/** A list is a collection, not a film: a strip of posters keeps the two distinct. */
export function ListCard({ list, onPress }: { list: LetterboxdList; onPress: () => void }) {
  const newTab = useNewTabPress(routes.letterboxdList(list.owner, list.slug));
  const count = list.filmCount == null ? '' : `${list.filmCount.toLocaleString()} ${list.filmCount === 1 ? 'film' : 'films'} · `;
  return (
    <View onPointerDown={newTab.onPointerDown}>
      <PressableCard
        accessibilityLabel={`${list.title}. ${count}by ${list.owner}`}
        accessibilityRole="button"
        cardClassName="h-56"
        onPress={() => { if (!newTab.opened()) onPress(); }}
      >
        <View className="flex-row gap-1 h-28 overflow-hidden rounded-md mb-3">
          {list.previews.length === 0 ? <PosterPlaceholder className="flex-1 border-0" /> : list.previews.map((film) => (
            <View className="flex-1 bg-background" key={film.id}>
              {film.coverImage === '' ? <PosterPlaceholder className="w-full h-full border-0" /> : (
                <Image className="w-full h-full" contentFit="cover" source={{ uri: film.coverImage }} />
              )}
            </View>
          ))}
        </View>
        <Text className="font-sans-semibold text-foreground text-sm h-10" numberOfLines={2}>{list.title}</Text>
        <Text className="font-sans text-muted text-xs mt-1" numberOfLines={1}>{`${count}by ${list.owner}`}</Text>
      </PressableCard>
    </View>
  );
}
