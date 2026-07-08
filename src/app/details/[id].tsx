import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useUnifiedFeed } from '@/state/queries/use-unified-feed';
import type { NormalizedMediaItem } from '@/types/media';

function findItemById(
  id: string,
  groups: NormalizedMediaItem[][],
): NormalizedMediaItem | undefined {
  return groups.flat().find((item) => item.id === id);
}

export default function DetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { trendingMovies, trendingShows, feedItems, isLoading } =
    useUnifiedFeed();

  const item = findItemById(id, [trendingMovies, trendingShows, feedItems]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-muted font-sans">Loading…</Text>
      </View>
    );
  }

  if (item == null) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Text className="text-2xl font-display text-foreground mb-2">
          Not found
        </Text>
        <Text className="text-muted font-sans text-center mb-6">
          This item is not in your current feed.
        </Text>
        <Pressable
          className="bg-accent px-5 py-3 rounded active:opacity-80"
          onPress={() => router.back()}
        >
          <Text className="text-accent-foreground font-sans-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1">
        <View className="h-96 relative">
          <Image
            source={{ uri: item.coverImage }}
            className="w-full h-full"
            contentFit="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.95)']}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 200,
            }}
          />
          <Pressable
            className="absolute top-12 left-4 w-10 h-10 bg-black/40 rounded-full items-center justify-center"
            onPress={() => router.back()}
          >
            <Text className="text-foreground font-sans-semibold text-lg">
              ←
            </Text>
          </Pressable>
        </View>

        <View className="px-6 -mt-16 pb-8">
          <Text className="text-accent text-sm font-sans-semibold uppercase tracking-wider mb-2">
            {item.type}
          </Text>
          <Text className="text-3xl font-display text-foreground mb-4">
            {item.title}
          </Text>

          <View className="flex-row gap-4 mb-6">
            <View className="bg-surface border border-border rounded-lg px-4 py-3 flex-1">
              <Text className="text-muted text-xs font-sans uppercase">
                Progress
              </Text>
              <Text className="text-foreground text-lg font-sans-semibold">
                {item.currentProgress}{' '}
                {item.progressUnit === 'chapter' ? 'chapters' : 'episodes'}
              </Text>
            </View>
            {item.totalEpisodes != null && (
              <View className="bg-surface border border-border rounded-lg px-4 py-3 flex-1">
                <Text className="text-muted text-xs font-sans uppercase">
                  Total
                </Text>
                <Text className="text-foreground text-lg font-sans-semibold">
                  {item.totalEpisodes} episodes
                </Text>
              </View>
            )}
          </View>

          <Pressable className="bg-accent px-5 py-3 rounded active:opacity-80">
            <Text className="text-accent-foreground font-sans-semibold text-base text-center">
              Log {item.type === 'MOVIE' ? 'watched' : '+1 episode'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
