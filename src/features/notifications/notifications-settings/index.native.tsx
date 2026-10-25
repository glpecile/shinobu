import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useState, useSyncExternalStore } from 'react';

import { Button } from '@/components/button';
import { NativeSwitch } from '@/components/native-switch';
import { RailHead } from '@/components/rail-head';
import { SettingsRail } from '@/features/settings/settings-rail';
import { useThemeColor } from '@/lib/theme-color';
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from '@/features/notifications/compute-schedule';
import { createRefreshDeps, refreshNotifications } from '@/features/notifications/refresh';
import { cancelAllScheduledNotifications, scheduleTestNotification } from '@/features/notifications/scheduler';
import type { UpNextInputs } from '@/features/up-next/types';
import {
  getMutedNotificationKinds,
  setNotificationKindMuted,
  setNotificationsEnabled,
  useNotificationKindEnabled,
  useNotificationsEnabled,
} from '@/state/prefs/notifications';
import { prefsStorage } from '@/state/prefs/storage';
import { upNextQueryKeys } from '@/state/queries/up-next';

/**
 * Opt-in toggle + permission flow + dev test affordance (plan 0020 U6, R8,
 * R11) as the Settings rail's Notifications section. Native only — see `index.tsx`.
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
function KindToggle({ kind, label, alertsOn }: { kind: NotificationKind; label: string; alertsOn: boolean }) {
  const enabled = useNotificationKindEnabled(kind);
  const queryClient = useQueryClient();
  const muted = useThemeColor('--color-muted');

  async function handleChange(next: boolean): Promise<void> {
    setNotificationKindMuted(kind, !next);
    await refreshNotifications(createRefreshDeps(queryClient), { throttle: false });
  }

  return (
    <SettingsRail.Row dimmed={!alertsOn}>
      <SettingsRail.Lead>
        <Ionicons color={muted} name={KIND_ICONS[kind]} size={18} />
      </SettingsRail.Lead>
      <SettingsRail.Text>
        <SettingsRail.Title>{label}</SettingsRail.Title>
      </SettingsRail.Text>
      <NativeSwitch
        accessibilityLabel={label}
        disabled={!alertsOn}
        onValueChange={handleChange}
        value={enabled}
      />
    </SettingsRail.Row>
  );
}

function subscribePrefs(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener(onStoreChange);
  return () => subscription.remove();
}

/** How many kinds are unmuted, for the section's count. */
function useEnabledKindCount(): number {
  return useSyncExternalStore(
    subscribePrefs,
    () => NOTIFICATION_KINDS.length - getMutedNotificationKinds().size,
  );
}

export function NotificationsSettingsSection() {
  const enabled = useNotificationsEnabled();
  const kindCount = useEnabledKindCount();
  const queryClient = useQueryClient();
  const [requesting, setRequesting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const muted = useThemeColor('--color-muted');

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

  let count = 'Off';
  if (enabled) count = kindCount === 1 ? '1 kind' : `${kindCount} kinds`;

  return (
    <SettingsRail.Section count={count} icon="notifications-outline" title="Notifications">
      <SettingsRail.Head label={`Notifications, ${count}`}>
        <RailHead.Icon name="notifications-outline">Notifications</RailHead.Icon>
        <RailHead.Count>{count}</RailHead.Count>
      </SettingsRail.Head>
      <SettingsRail.Row>
        <SettingsRail.Lead>
          <Ionicons color={muted} name="alarm-outline" size={18} />
        </SettingsRail.Lead>
        <SettingsRail.Text>
          <SettingsRail.Title>Release alerts</SettingsRail.Title>
          <SettingsRail.Subtitle lines={2}>
            {permissionDenied
              ? "Notifications are blocked for Shinobu. Allow them in your device's settings."
              : 'Scheduled on this device, 7 to 14 days ahead.'}
          </SettingsRail.Subtitle>
        </SettingsRail.Text>
        <NativeSwitch
          accessibilityLabel="Release alerts"
          disabled={requesting}
          onValueChange={handleToggle}
          value={enabled}
        />
      </SettingsRail.Row>
      {NOTIFICATION_KINDS.map(({ kind, label }) => (
        <KindToggle alertsOn={enabled} key={kind} kind={kind} label={label} />
      ))}
      {__DEV__ && enabled && (
        <SettingsRail.Row>
          <Button
            icon={<Button.Icon name="notifications-outline" />}
            label="Send test notification"
            onPress={() => scheduleTestNotification(sampleTrackedItemId(queryClient))}
            size="md"
            variant="quiet"
          />
        </SettingsRail.Row>
      )}
    </SettingsRail.Section>
  );
}
