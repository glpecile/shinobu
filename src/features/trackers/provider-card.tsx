import Ionicons from '@react-native-vector-icons/ionicons/static';
import { View } from 'react-native';

import { ProviderIcon } from '@/components/provider-icon';
import { SettingsRail } from '@/features/settings/settings-rail';
import { useProviderUsername } from '@/features/trackers/use-provider-username';
import { useThemeColor } from '@/lib/theme-color';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

/**
 * One provider's row on the Trackers rail. Pressing it opens the provider's
 * sheet, which connects or disconnects, so every row ends in a chevron.
 *
 * The caller owns the connected/disconnected decision (`splitProviders`).
 * `reconnect` is Trakt holding a token without the user's own credentials
 * (plan 0034 U9): gated out of connected, so the row says why.
 */
export function ProviderCard({
  id,
  connected,
  reconnect = false,
  onOpenSheet,
}: {
  id: ProviderId;
  connected: boolean;
  reconnect?: boolean;
  onOpenSheet: () => void;
}) {
  const username = useProviderUsername(id, connected);
  const { label } = PROVIDERS[id];
  const muted = useThemeColor('--color-muted');

  let status;
  if (connected) {
    status = (
      <View className="flex-row items-center gap-1.5">
        <View className="w-1.5 h-1.5 rounded-full bg-success mt-0.5" />
        <View className="flex-1 min-w-0">
          <SettingsRail.Subtitle>{username ?? 'Connected'}</SettingsRail.Subtitle>
        </View>
      </View>
    );
  } else if (reconnect) {
    status = (
      <SettingsRail.Subtitle lines={2}>
        {label} now needs your own API app. Reconnect to resume syncing.
      </SettingsRail.Subtitle>
    );
  } else {
    status = <SettingsRail.Subtitle>Not connected</SettingsRail.Subtitle>;
  }

  return (
    <SettingsRail.Row>
      <SettingsRail.Target accessibilityLabel={`${label} settings`} onPress={onOpenSheet}>
        <SettingsRail.Lead>
          <View className="w-9 h-9 rounded-md bg-background border border-border items-center justify-center">
            <ProviderIcon id={id} size={22} />
          </View>
        </SettingsRail.Lead>
        <SettingsRail.Text>
          <SettingsRail.Title>{label}</SettingsRail.Title>
          {status}
        </SettingsRail.Text>
        <Ionicons color={muted} name="chevron-forward" size={18} />
      </SettingsRail.Target>
    </SettingsRail.Row>
  );
}
