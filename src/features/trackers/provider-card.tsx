import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ProviderIcon } from '@/components/provider-icon';
import { CARD_SHELL } from '@/components/card-shell';
import { compactStatus, PROVIDER_DOT } from '@/features/trackers/provider-style';
import { useConnectAction } from '@/features/trackers/use-connect-action';
import { useProviderUsername } from '@/features/trackers/use-provider-username';
import { cn } from '@/lib/cn';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useDisconnectProvider } from '@/state/session';

/**
 * One provider's row, in whichever of its two states applies.
 *
 * The same shape either way — icon chip, name, status line, one right-hand
 * action — so a disconnected provider never towers over a connected one and
 * the screen reads as a single list. Connecting happens in place when the
 * provider needs nothing from the user, and hands off to the sheet when it does
 * (`use-connect-action.ts`); the sheet is never just a wrapper around a button.
 *
 * The caller owns the connected/disconnected decision (`splitProviders`) — the
 * card doesn't re-check it, which is what the four `*ConnectRow` wrappers this
 * replaced used to do on top of the section filter that had already excluded
 * them.
 */
export function ProviderCard({
  id,
  connected,
  onOpenSheet,
}: {
  id: ProviderId;
  connected: boolean;
  onOpenSheet: () => void;
}) {
  const disconnect = useDisconnectProvider();
  const username = useProviderUsername(id, connected);
  const { needsSheet, connect, connecting } = useConnectAction(id);

  return (
    // `p-4` overrides the shell's `p-5` (cn resolves the collision): a row
    // that has to fit a chip, a name, a status line *and* a button needs the
    // 8px back — "Letterboxd" truncated to "Letterb…" at 390px without it.
    <View className={cn(CARD_SHELL, 'p-4')}>
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-md bg-background border border-border items-center justify-center">
          <ProviderIcon id={id} size={22} />
        </View>
        <View className="flex-1 ml-3 mr-3">
          <Text
            className="text-foreground font-sans-semibold text-base"
            numberOfLines={1}
          >
            {PROVIDERS[id].label}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            {connected && (
              <View className={cn('w-1.5 h-1.5 rounded-full', PROVIDER_DOT[id])} />
            )}
            <Text
              className="flex-1 text-muted font-sans text-xs"
              numberOfLines={1}
            >
              {compactStatus(connected, username)}
            </Text>
          </View>
        </View>
        {connected ? (
          <Button
            accessibilityLabel={`Disconnect ${PROVIDERS[id].label}`}
            className="shrink-0"
            label="Disconnect"
            onPress={() => disconnect(id)}
            size="sm"
            variant="quiet"
          />
        ) : (
          <Button
            accessibilityLabel={`Connect ${PROVIDERS[id].label}`}
            className="shrink-0"
            label="Connect"
            // The one-tap providers open a browser session, which takes long
            // enough on a cold start to look like a dead tap without this.
            loading={connecting}
            onPress={needsSheet ? onOpenSheet : connect}
            size="sm"
            variant="outline"
          />
        )}
      </View>
    </View>
  );
}
