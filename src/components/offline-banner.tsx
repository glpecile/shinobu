import Ionicons from '@react-native-vector-icons/ionicons/static';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';

import { useThemeColor } from '@/lib/theme-color';

/**
 * Shown while the app counts as offline (`lib/online`): reads pause and logs
 * wait in the pending queue.
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    onlineManager.subscribe,
    () => onlineManager.isOnline(),
    () => true,
  );
  const muted = useThemeColor('--color-muted');
  if (online) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      className="mx-4 mb-3 flex-row items-center gap-2 rounded-xl bg-surface px-3 py-2"
    >
      <Ionicons color={muted} name="cloud-offline-outline" size={16} />
      <Text className="flex-1 font-sans text-sm text-muted">
        You are offline. Logs wait on this device until you are back online.
      </Text>
    </View>
  );
}
