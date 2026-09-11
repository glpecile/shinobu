import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { useThemeColor } from '@/lib/theme-color';

/**
 * End-of-list footer for a paginated grid. A page failing mid-scroll keeps
 * every loaded page on screen and offers a retry right where the scroll
 * stopped — the same partial-failure treatment as an inline notice.
 */
export function LoadMoreFooter({
  loading,
  failed,
  onRetry,
  noun,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  /** What a page holds — "films", "titles" — for the retry copy. */
  noun: string;
}) {
  const muted = useThemeColor('--color-muted');
  if (failed) {
    return (
      <View className="items-center py-8 px-8">
        <Text className="text-muted font-sans text-sm text-center">
          {`Couldn’t load more ${noun}.`}
        </Text>
        <Button
          accessibilityLabel={`Retry loading more ${noun}`}
          className="mt-3"
          label="Try again"
          onPress={onRetry}
          size="sm"
          variant="quiet"
        />
      </View>
    );
  }
  if (!loading) return <View className="h-12" />;
  return (
    <View accessibilityLabel={`Loading more ${noun}`} className="items-center py-8">
      <ActivityIndicator color={muted} size="small" />
    </View>
  );
}
