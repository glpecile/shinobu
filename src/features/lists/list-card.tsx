import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PressableCard } from '@/components/pressable-card';
import { ProviderIcon } from '@/components/provider-icon';
import { useNewTabPress } from '@/components/use-new-tab-press';
import { formatCount } from '@/lib/format-count';
import type { ProviderId } from '@/lib/providers/types';

/** A four-poster filmstrip with compact count/author metadata and a provider mark. */
export function ListCard({ list, count: itemCount, noun = 'film', provider, href, onPress }: {
  list: { title: string; owner: string; previews: { id: string; coverImage: string }[] };
  count?: number;
  noun?: 'film' | 'item';
  provider?: ProviderId;
  href: string;
  onPress: () => void;
}) {
  const newTab = useNewTabPress(href);
  const count = itemCount == null ? '' : `${formatCount(itemCount)} ${noun}${itemCount === 1 ? '' : 's'}`;
  const meta = count === '' ? `by ${list.owner}` : `${count} · by ${list.owner}`;
  const strip = list.previews.slice(0, 4);
  return (
    <View onPointerDown={newTab.onPointerDown}>
      <PressableCard
        accessibilityLabel={`${list.title}. ${meta}`}
        accessibilityRole="button"
        onPress={() => { if (!newTab.opened()) onPress(); }}
        padded={false}
      >
        <View className="h-44 rounded-lg overflow-hidden bg-surface">
          <View className="h-full flex-row">
            {strip.length === 0 ? (
              <PosterPlaceholder className="w-full h-full" />
            ) : (
              strip.map((film, index) => (
                <View className="flex-1" key={`${film.id}/${index}`}>
                  {film.coverImage === '' ? <PosterPlaceholder className="w-full h-full border-0" /> : (
                    <Image className="w-full h-full" contentFit="cover" source={{ uri: film.coverImage }} />
                  )}
                </View>
              ))
            )}
          </View>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.92)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 124 }}
          />
          <View className="absolute inset-x-0 bottom-0 p-3">
            <Text className="text-accent-foreground font-sans-semibold text-sm leading-tight" numberOfLines={2}>{list.title}</Text>
            <View className="flex-row items-center mt-1.5">
              <Text className="text-accent-foreground/70 font-sans text-xs flex-1" numberOfLines={1}>
                {count}
                {count === '' ? 'by ' : ' · by '}
                <Text className="font-sans-semibold">{list.owner}</Text>
              </Text>
              {provider != null && (
                <View className="ml-2"><ProviderIcon id={provider} size={12} /></View>
              )}
            </View>
          </View>
        </View>
      </PressableCard>
    </View>
  );
}
