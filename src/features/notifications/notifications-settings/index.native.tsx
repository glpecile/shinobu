import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Eyebrow } from '@/components/eyebrow';
import { GroupedList } from '@/components/grouped-list';
import { NativeSwitch } from '@/components/native-switch';
import { useThemeColor } from '@/lib/theme-color';
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from '@/features/notifications/compute-schedule';
import { createRefreshDeps, refreshNotifications } from '@/features/notifications/refresh';
import { cancelAllScheduledNotifications, scheduleTestNotification } from '@/features/notifications/scheduler';
import type { UpNextInputs } from '@/features/up-next/types';
import {
  setNotificationKindMuted,
  setNotificationsEnabled,
  useNotificationKindEnabled,
  useNotificationsEnabled,
} from '@/state/prefs/notifications';
import { upNextQueryKeys } from '@/state/queries/up-next';

/**
 * Opt-in toggle + permission flow + dev test affordance (plan 0020 U6, R8,
 * R11) on the Manage Trackers screen. Native only — see `index.tsx`.
 */

/** Best-effort: whatever Up Next already has cached, no extra fetch (R11's "real tracked item"). */
function sampleTrackedItemId(queryClient: QueryClient): string | undefined {
  const cached = queryClient.getQueryData<UpNextInputs>(upNextQueryKeys.inputs());
  return cached?.progress[0]?.item.id ?? cached?.anilist[0]?.item.id;
}

const KIND_ICONS = {
  episode: 'tv-outline',
  theatrical: 'film-outline',
  digital: 'play-circle-outline',
  physical: 'disc-outline',
} as const satisfies Record<NotificationKind, string>;

/** Mutes one kind and reschedules now, so the change applies before the next foreground. */
function KindToggle({ kind, label }: { kind: NotificationKind; label: string }) {
  const enabled = useNotificationKindEnabled(kind);
  const queryClient = useQueryClient();
  const muted = useThemeColor('--color-muted');

  async function handleChange(next: boolean): Promise<void> {
    setNotificationKindMuted(kind, !next);
    await refreshNotifications(createRefreshDeps(queryClient), { throttle: false });
  }

  return (
    <GroupedList.Item className="flex-row items-center">
      <Ionicons accessible={false} color={muted} name={KIND_ICONS[kind]} size={18} />
      <Text className="flex-1 mx-3 text-foreground font-sans text-base" numberOfLines={1}>
        {label}
      </Text>
      <NativeSwitch accessibilityLabel={label} onValueChange={handleChange} value={enabled} />
    </GroupedList.Item>
  );
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
    <View>
      <Eyebrow className="mb-3">Notifications</Eyebrow>
      <GroupedList>
        <GroupedList.Item className="flex-row items-center">
          <View className="flex-1 mr-3">
            <Text className="text-foreground font-sans-semibold text-base">Release alerts</Text>
            <Text className="text-muted font-sans text-xs mt-0.5">
              {permissionDenied
                ? "Notifications are blocked for Shinobu. Allow them in your device's settings."
                : 'Local notifications when something you track airs or comes out.'}
            </Text>
          </View>
          <NativeSwitch
            accessibilityLabel="Release alerts"
            disabled={requesting}
            onValueChange={handleToggle}
            value={enabled}
          />
        </GroupedList.Item>
        {enabled &&
          NOTIFICATION_KINDS.map(({ kind, label }) => (
            <KindToggle key={kind} kind={kind} label={label} />
          ))}
        {__DEV__ && enabled && (
          <GroupedList.Item>
            <Button
              className="self-start"
              icon={<Button.Icon name="notifications-outline" />}
              label="Send test notification"
              onPress={() => scheduleTestNotification(sampleTrackedItemId(queryClient))}
              size="sm"
              variant="quiet"
            />
          </GroupedList.Item>
        )}
      </GroupedList>
    </View>
  );
}
