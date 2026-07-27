import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { CONTROL_RADIUS } from '@/features/trackers/card-shell';
import { CONNECT_BUTTONS } from '@/features/trackers/connect-buttons';
import { capabilityLabels } from '@/features/trackers/provider-style';
import { useProviderUsername } from '@/features/trackers/use-provider-username';
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
      <View className="flex-row items-center gap-3 mb-1">
        <ProviderIcon id={id} size={24} />
        <Text className="text-foreground font-display text-xl">
          {PROVIDERS[id].label}
        </Text>
      </View>
      <Text className="text-muted font-sans text-sm mb-4">
        {connected
          ? `Connected${username != null ? ` as ${username}` : ''}`
          : capabilityLabels(id).join(' · ')}
      </Text>
      {connected ? (
        <View className="flex-row">
          <PresstableOpacity
            className={`shrink-0 border border-accent px-4 py-2 ${CONTROL_RADIUS}`}
            onPress={() => {
              disconnect(id);
              onDone();
            }}
          >
            <Text className="text-accent font-sans-semibold text-sm">
              Disconnect
            </Text>
          </PresstableOpacity>
        </View>
      ) : (
        <ConnectButton />
      )}
    </>
  );
}
