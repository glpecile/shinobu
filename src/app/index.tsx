import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { ConnectTraktButton } from "@/components/connect-trakt-button";
import { FeedSkeleton } from "@/components/feed-skeleton";
import { MediaCarousel } from "@/components/media-carousel";
import { PROVIDERS } from "@/lib/providers/registry";
import type { ProviderId } from "@/lib/providers/types";
import { useUnifiedFeed } from "@/state/queries/use-unified-feed";
import {
  useConnectedProviders,
  useDisconnectProvider,
} from "@/state/session";
import type { NormalizedMediaItem } from "@/types/media";

function ProviderRow({ id }: { id: ProviderId }) {
  const connected = useConnectedProviders();
  const disconnect = useDisconnectProvider();
  const isConnected = connected.includes(id);

  if (id === "trakt") {
    return isConnected ? (
      <Pressable
        className="border border-border rounded-xl px-6 py-4 items-center bg-surface"
        onPress={() => disconnect("trakt")}
      >
        <Text className="text-foreground font-sans-semibold text-base">
          Trakt connected
        </Text>
        <Text className="text-muted font-sans text-xs mt-1">
          Tap to disconnect
        </Text>
      </Pressable>
    ) : (
      <View className="border border-border rounded-xl px-6 py-5 items-center bg-surface">
        <ConnectTraktButton />
      </View>
    );
  }

  if (id === "letterboxd") {
    return (
      <View className="border border-border rounded-xl px-6 py-4 items-center bg-surface opacity-60">
        <Text className="text-foreground font-sans-semibold text-base">
          Letterboxd
        </Text>
        <Text className="text-muted font-sans text-xs mt-1">
          Waiting on API access
        </Text>
      </View>
    );
  }

  return (
    <View className="border border-border rounded-xl px-6 py-4 items-center bg-surface opacity-60">
      <Text className="text-foreground font-sans-semibold text-base">
        {PROVIDERS[id].label}
      </Text>
      <Text className="text-muted font-sans text-xs mt-1">Coming soon</Text>
    </View>
  );
}

function ConnectScreen() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="items-center mb-8">
        <Text className="text-5xl font-display text-foreground mb-3 text-center">
          忍
        </Text>
        <Text className="text-2xl font-display text-foreground text-center">
          Connect your trackers
        </Text>
        <Text className="text-base font-sans text-muted mt-3 text-center max-w-xs leading-relaxed">
          Choose the providers you use. Your feed appears as soon as you connect
          the first one.
        </Text>
      </View>

      <View className="w-full max-w-sm gap-3">
        {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
          <ProviderRow id={id} key={id} />
        ))}
      </View>
    </View>
  );
}

function FeedScreen() {
  const { trendingMovies, trendingShows, feedItems, isLoading, isError } =
    useUnifiedFeed();
  const disconnect = useDisconnectProvider();
  const router = useRouter();

  function openDetails(item: NormalizedMediaItem) {
    router.push(`/details/${item.id}`);
  }

  return (
    <View className="flex-1">
      {isLoading ? (
        <FeedSkeleton />
      ) : isError ? (
        <Text className="text-accent font-sans text-center mt-12">
          Could not load your feed.
        </Text>
      ) : (
        <View className="pt-2 pb-4">
          <MediaCarousel
            title="Trending Movies"
            items={trendingMovies}
            onItemPress={openDetails}
          />
          <MediaCarousel
            title="Trending TV Shows"
            items={trendingShows}
            onItemPress={openDetails}
          />
          <MediaCarousel
            title="Your Shows"
            items={feedItems}
            onItemPress={openDetails}
          />
        </View>
      )}

      <Pressable className="py-4" onPress={() => disconnect("trakt")}>
        <Text className="text-accent font-sans text-center">
          Disconnect Trakt
        </Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  const connected = useConnectedProviders();

  return (
    <View className="flex-1 bg-background">
      <View className="pt-16 px-6 pb-4">
        <Text className="text-4xl font-display text-foreground tracking-tight">
          忍 Shinobu
        </Text>
        <Text className="text-muted font-sans mt-1">
          {connected.length === 0
            ? "No providers connected"
            : `Connected: ${connected.map((id) => PROVIDERS[id].label).join(", ")}`}
        </Text>
      </View>

      {connected.length === 0 ? <ConnectScreen /> : <FeedScreen />}

      <StatusBar style="auto" />
    </View>
  );
}
