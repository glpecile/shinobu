import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { CONNECT_BUTTONS } from '@/features/trackers/connect-buttons';
import {
  capabilityLabels,
  PROVIDER_DOT,
  statusLine,
} from '@/features/trackers/provider-style';
import { useProviderUsername } from '@/features/trackers/use-provider-username';
import { cn } from '@/lib/cn';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders, useDisconnectProvider } from '@/state/session';

/**
 * The one provider sheet for the whole screen.
 *
 * Deliberately *not* one per card: `ModalBottomSheet` instances all register
 * with the single `SheetProvider` host, and four mounted at once measured their
 * `'content'` detent as the full screen height — a two-line connect flow opened
 * as a full-page sheet. Every other caller in the app (`card-actions-sheet`,
 * `log-confirm-sheet`) mounts exactly one; this follows that shape, with the
 * section owning "which provider is open".
 */
export function ProviderSheet({
  id,
  open,
  onClose,
}: {
  /** Kept (not nulled) while closing so content doesn't vanish mid-animation. */
  id: ProviderId | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} open={open && id != null}>
      {id != null && <ProviderSheetContent id={id} onDone={onClose} />}
    </Sheet>
  );
}

function ProviderSheetContent({
  id,
  onDone,
}: {
  id: ProviderId;
  onDone: () => void;
}) {
  const disconnect = useDisconnectProvider();
  const connected = useConnectedProviders().includes(id);
  const username = useProviderUsername(id, connected);
  const ConnectButton = CONNECT_BUTTONS[id];

  return (
    <>
      {/* Same identity block as the row it was opened from — icon chip, name,
          then dot + status — so the sheet reads as that row expanded rather
          than as a different screen. */}
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-md bg-background border border-border items-center justify-center">
          <ProviderIcon id={id} size={22} />
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-foreground font-display text-xl">
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
              {connected
                ? statusLine(connected, username)
                : capabilityLabels(id).join(' · ')}
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-5">
        {connected ? (
          <Button
            label="Disconnect"
            onPress={() => {
              disconnect(id);
              onDone();
            }}
            variant="outline"
          />
        ) : (
          <ConnectButton />
        )}
      </View>
    </>
  );
}
