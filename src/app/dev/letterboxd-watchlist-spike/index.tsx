import { Text, View } from 'react-native';

import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { cn } from '@/lib/cn';

/**
 * Web's half of U6's capture harness — a notice, and permanently so.
 *
 * The capture has to run inside the authenticated WebView, which exists only on
 * native (replayed cookies land as signed-out at Letterboxd's origin,
 * `docs/solutions/letterboxd-no-api-fallback.md`), and Letterboxd writes stay
 * web-banned regardless of what the spike finds — no Worker rule is added
 * (`docs/solutions/letterboxd-web-proxy.md`). So this is not a gap to fill later.
 */
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
