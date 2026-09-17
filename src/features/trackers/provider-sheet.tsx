import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { SheetHeader } from '@/components/sheet-header';
import { CONNECT_BUTTONS } from '@/features/trackers/connect-buttons';
import {
  capabilityLabels,
  statusLine,
} from '@/features/trackers/provider-style';
import { useProviderUsername } from '@/features/trackers/use-provider-username';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useDisconnectProvider } from '@/state/session';

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
  connected,
  open,
  onClose,
}: {
  /** Kept (not nulled) while closing so content doesn't vanish mid-animation. */
  id: ProviderId | null;
  /**
   * Whether the provider was connected when the sheet opened, not now: a
   * connect or disconnect flips the live value while the sheet is still
   * closing, which swapped in the other form for its last frames.
   */
  connected: boolean;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet autoFocus onClose={onClose} open={open && id != null}>
      {id != null && (
        <ProviderSheetContent connected={connected} id={id} onDone={onClose} />
      )}
    </Sheet>
  );
}

function ProviderSheetContent({
  id,
  connected,
  onDone,
}: {
  id: ProviderId;
  connected: boolean;
  onDone: () => void;
}) {
  const disconnect = useDisconnectProvider();
  const username = useProviderUsername(id, connected);
  const ConnectButton = CONNECT_BUTTONS[id];

  return (
    <>
      <SheetHeader>
        <View className="w-10 h-10 rounded-md bg-background border border-border items-center justify-center">
          <ProviderIcon id={id} size={22} />
        </View>
        <SheetHeader.Content>
          <SheetHeader.Title>{PROVIDERS[id].label}</SheetHeader.Title>
          <SheetHeader.Subtitle>
            {connected
              ? statusLine(connected, username)
              : capabilityLabels(id).join(' · ')}
          </SheetHeader.Subtitle>
        </SheetHeader.Content>
      </SheetHeader>

      {connected ? (
        <View className="mt-5 gap-3">
          <Text className="text-muted font-sans text-sm">
            Shinobu forgets this {PROVIDERS[id].label} session on this device.
            Nothing on {PROVIDERS[id].label} is deleted, and you can reconnect
            any time.
          </Text>
          <Button
            icon={<Button.Icon name="unlink-outline" />}
            label="Disconnect"
            onPress={() => {
              disconnect(id);
              onDone();
            }}
          />
          <Button
            icon={<Button.Icon name="close" />}
            label="Cancel"
            onPress={onDone}
            variant="quiet"
          />
        </View>
      ) : (
        <View className="mt-5">
          <ConnectButton />
        </View>
      )}
    </>
  );
}
