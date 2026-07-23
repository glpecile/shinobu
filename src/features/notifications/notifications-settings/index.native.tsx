import { Switch } from '@expo/ui';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { createRefreshDeps, refreshNotifications } from '@/features/notifications/refresh';
import { cancelAllScheduledNotifications, scheduleTestNotification } from '@/features/notifications/scheduler';
import type { UpNextInputs } from '@/features/up-next/types';
import { setNotificationsEnabled, useNotificationsEnabled } from '@/state/prefs/notifications';
import { upNextQueryKeys } from '@/state/queries/up-next';

/**
 * Opt-in toggle + permission flow + dev test affordance (plan 0020 U6, R8,
 * R11) on the Manage Trackers screen. Native only — see `index.tsx`.
 */

/** Best-effort: whatever Up Next already has cached, no extra fetch (R11's "real tracked item"). */
function sampleTrackedItemId(queryClient: QueryClient): string | undefined {
  const cached = queryClient.getQueryData<UpNextInputs>(upNextQueryKeys.inputs());
  return cached?.trakt[0]?.item.id ?? cached?.anilist[0]?.item.id;
}

export function NotificationsSettingsSection() {
  const enabled = useNotificationsEnabled();
  const queryClient = useQueryClient();
  const [requesting, setRequesting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  async function handleToggle(next: boolean): Promise<void> {
    if (!next) {
      setNotificationsEnabled(false);
      setPermissionDenied(false);
      await cancelAllScheduledNotifications();
      return;
    }

    setRequesting(true);
    try {
      const { granted } = await Notifications.requestPermissionsAsync();
      if (!granted) {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      setNotificationsEnabled(true);
      await refreshNotifications(createRefreshDeps(queryClient));
    } finally {
      setRequesting(false);
    }
  }

  return (
    <View className="mt-6">
      <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-3">
        Notifications
      </Text>
      <View className="bg-surface border border-border rounded-xl px-5 py-4 gap-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-foreground font-sans-semibold text-base">
              New episode alerts
            </Text>
            <Text className="text-muted font-sans text-xs mt-0.5">
              Local notifications when a tracked show's next episode airs.
            </Text>
          </View>
          <Switch disabled={requesting} onValueChange={handleToggle} value={enabled} />
        </View>
        {permissionDenied && (
          <Text className="text-muted font-sans text-xs">
            Notifications are blocked for Shinobu — enable them in your device's
            system settings.
          </Text>
        )}
        {enabled && (
          <PresstableOpacity
            className="border border-border px-4 py-2 rounded self-start"
            onPress={() => scheduleTestNotification(sampleTrackedItemId(queryClient))}
          >
            <Text className="text-foreground font-sans-semibold text-sm">
              Send test notification
            </Text>
          </PresstableOpacity>
        )}
      </View>
    </View>
  );
}
