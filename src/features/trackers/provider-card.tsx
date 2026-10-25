import { View } from 'react-native';

import { Button } from '@/components/button';
import { ProviderIcon } from '@/components/provider-icon';
import { SettingsRail } from '@/features/settings/settings-rail';
import { capabilityLabels } from '@/features/trackers/provider-style';
import { useConnectAction } from '@/features/trackers/use-connect-action';
import { useProviderUsername } from '@/features/trackers/use-provider-username';
import { haptics } from '@/lib/haptics';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

/**
 * One provider's row on the Trackers rail, in whichever of its two states
 * applies. Pressing the row opens the provider's sheet. Connecting happens in
 * place when the provider needs nothing from the user and hands off to the
 * sheet when it does (`use-connect-action.ts`).
 *
 * The caller owns the connected/disconnected decision (`splitProviders`).
 * `reconnect` is Trakt holding a token without the user's own credentials
 * (plan 0034 U9): gated out of connected, so the row says why and the button
 * opens the same guided setup.
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
  const { needsSheet, connect, connecting } = useConnectAction(id);
  const { label } = PROVIDERS[id];

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
    status = <SettingsRail.Subtitle>{capabilityLabels(id).join(', ')}</SettingsRail.Subtitle>;
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
      </SettingsRail.Target>
      {connected ? (
        // The one label-only button (components/button docblock).
        <Button
          accessibilityLabel={`Disconnect ${label}`}
          className="shrink-0"
          label="Disconnect"
          onPress={onOpenSheet}
          size="md"
          variant="quiet"
        />
      ) : (
        <Button
          accessibilityLabel={`${reconnect ? 'Reconnect' : 'Connect'} ${label}`}
          className="shrink-0"
          icon={<Button.Icon name="link-outline" />}
          label={reconnect ? 'Reconnect' : 'Connect'}
          // The one-tap providers open a browser session, which takes long
          // enough on a cold start to look like a dead tap without this.
          loading={connecting}
          onPress={() => {
            if (needsSheet) {
              onOpenSheet();
              return;
            }
            haptics.selection();
            connect();
          }}
          size="md"
        />
      )}
    </SettingsRail.Row>
  );
}
