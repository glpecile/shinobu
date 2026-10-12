import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { cn } from '@/lib/cn';
import { routes } from '@/lib/routes';
import { toast } from '@/lib/toast';

function showSingle() {
  toast.error('Episodes unavailable', 'AniList didn’t respond — pull to refresh to try again.');
}

function showStack() {
  toast.success('Added to watchlist');
  toast.error('Recommendations unavailable', 'AniList is rate limited — try again shortly.');
  showSingle();
}

/** Uses the root toast host, with no provider calls or custom dismissal timers. */
export default function ToastStackTestScreen() {
  if (!__DEV__) return <Redirect href={routes.home} />;

  return (
    <View className={cn('flex-1 bg-background px-6 pb-8 gap-6', screenHeaderTopPadding)}>
      <View className={cn('gap-3 max-w-xl')}>
        <Text className={cn('text-2xl font-display text-foreground')}>Toast stack test</Text>
        <Text className={cn('font-sans text-base text-muted')}>
          Show three notifications, then hover the stack. Its layout should stay unchanged.
          Move the pointer away to let them dismiss, or drag a notification to dismiss it.
        </Text>
        <Text className={cn('font-sans text-sm text-muted')}>
          Resize the browser to a phone width to check content coverage. Success lasts
          2 seconds; errors last 3.5 seconds. Hovering pauses dismissal.
        </Text>
        <View className={cn('flex-row flex-wrap gap-3')}>
          <Button
            icon={<Button.Icon name="open-outline" />}
            label="Show three toasts"
            onPress={showStack}
          />
          <Button
            icon={<Button.Icon name="open-outline" />}
            label="Show one toast"
            onPress={showSingle}
            variant="quiet"
          />
        </View>
      </View>
      <View className={cn('flex-1 justify-end items-end')}>
        <View className={cn('w-full max-w-sm h-64 rounded-xl border border-border bg-surface p-4 justify-between')}>
          <Text className={cn('font-sans-semibold text-base text-foreground')}>Content behind notifications</Text>
          <Text className={cn('font-sans text-sm text-muted')}>Middle of the content area</Text>
          <Text className={cn('font-sans text-sm text-muted')}>Bottom of the content area</Text>
        </View>
      </View>
    </View>
  );
}
