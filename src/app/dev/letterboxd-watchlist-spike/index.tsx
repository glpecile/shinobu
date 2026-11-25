import { Text, View } from 'react-native';

import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { cn } from '@/lib/cn';

// Native-only: replayed cookies land signed-out (docs/solutions/letterboxd-no-api-fallback.md, docs/solutions/letterboxd-web-proxy.md).
export default function LetterboxdWatchlistSpikeWebScreen() {
  return (
    <View className={cn('flex-1 bg-background px-6', screenHeaderTopPadding)}>
      <Text className="text-2xl font-display text-foreground">
        Run this one on a device
      </Text>
      <Text className="text-muted font-sans mt-3">
        The capture needs the authenticated WebView, which is native-only — and
        Letterboxd writes stay web-banned whatever it finds.
      </Text>
    </View>
  );
}
