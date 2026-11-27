import Ionicons from '@react-native-vector-icons/ionicons/static';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';

import { AnimatedView } from '@/components/animated-view';
import { sectionFading } from '@/components/section-enter';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

/** Shown while the app counts as offline (`lib/online`). */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    onlineManager.subscribe,
    () => onlineManager.isOnline(),
    () => true,
  );
  const muted = useThemeColor('--color-muted');
  return (
    <View accessibilityLiveRegion="polite">
      {!online && (
        <AnimatedView
          className="mx-4 mb-3 flex-row items-center gap-2 rounded-xl bg-surface px-3 py-2"
          style={{
            animationName: sectionFading,
            animationDuration: `${DURATION.swap}ms`,
            animationTimingFunction: EASE_OUT,
          }}
        >
          <View
            accessibilityElementsHidden
            aria-hidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons color={muted} name="cloud-offline-outline" size={16} />
          </View>
          <Text className="flex-1 font-sans text-sm text-muted">
            You are offline. Logs wait on this device until you are back online.
          </Text>
        </AnimatedView>
      )}
    </View>
  );
}
