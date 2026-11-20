import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { PersonAvatar } from '@/features/person/person-avatar';
import { PresstableScale } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { SheetHeader } from '@/components/sheet-header';
import { Skeleton } from '@/components/skeleton';
import { CONNECT_BUTTONS } from '@/features/trackers/connect-buttons';
import { LetterboxdAdvancedSetup } from '@/features/trackers/letterboxd-advanced-setup';
import { capabilityLabels } from '@/features/trackers/provider-style';
import { useProviderAccount } from '@/features/trackers/use-provider-account';
import { haptics } from '@/lib/haptics';
import { openExternalUrl } from '@/lib/open-external-url';
import { PROVIDERS } from '@/lib/providers/registry';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';
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
  /** Whether the provider was connected when the sheet opened. */
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
  const account = useProviderAccount(id, connected);
  const ConnectButton = CONNECT_BUTTONS[id];
  const { label } = PROVIDERS[id];
  const name = account.username ?? `${label} account`;
  const { profileUrl } = account;
  const a11yLabel = account.username == null ? `Connected to ${label}` : `Connected as ${account.username}`;
  const muted = useThemeColor('--color-muted');
  const accountCard = (
    <View className="flex-row items-center gap-3 bg-background border border-border rounded-lg px-4 py-3">
      {account.loading === true ? (
        <Skeleton className="w-11 h-11 rounded-full" />
      ) : (
        <PersonAvatar
          className="w-11 h-11"
          headshot={account.avatar ?? ''}
          name={name}
          textClassName="text-sm"
        />
      )}
      <View className="flex-1 min-w-0">
        {account.loading === true ? (
          <Skeleton className="h-4 w-24 rounded-sm my-1" />
        ) : (
          <Text className="text-foreground font-sans-semibold text-base" numberOfLines={1}>
            {name}
          </Text>
        )}
        <View className="flex-row items-center gap-1.5 mt-0.5">
          <View className="w-1.5 h-1.5 rounded-full bg-success" />
          <Text className="text-muted font-sans text-sm">Connected</Text>
        </View>
      </View>
      {profileUrl != null && <Ionicons color={muted} name="open-outline" size={16} />}
    </View>
  );

  return (
    <>
      <SheetHeader>
        <View className="w-10 h-10 rounded-md bg-background border border-border items-center justify-center">
          <ProviderIcon id={id} size={22} />
        </View>
        <SheetHeader.Content>
          <SheetHeader.Title>{label}</SheetHeader.Title>
          <SheetHeader.Subtitle>{capabilityLabels(id).join(' · ')}</SheetHeader.Subtitle>
        </SheetHeader.Content>
      </SheetHeader>

      {connected ? (
        <View className="mt-5 gap-4">
          {profileUrl == null ? (
            <View accessible accessibilityLabel={a11yLabel}>
              {accountCard}
            </View>
          ) : (
            <PresstableScale
              accessibilityHint={`Opens your ${label} profile`}
              accessibilityLabel={a11yLabel}
              accessibilityRole="link"
              className="rounded-lg"
              minScale={0.99}
              onPress={() => openExternalUrl(profileUrl)}
            >
              {accountCard}
            </PresstableScale>
          )}
          <View className="flex-row items-start gap-2">
            {/* Uniwind drops className on the raw icon on native, so the offset sits on a View. */}
            <View aria-hidden className="mt-0.5">
              <Ionicons color={muted} name="information-circle-outline" size={16} />
            </View>
            <Text className="flex-1 text-muted font-sans text-sm">
              Disconnect signs Shinobu out of {label} on this device. Your {label}{' '}
              account and its data do not change.
            </Text>
          </View>
          <Button
            label="Disconnect"
            onPress={() => {
              haptics.destructive();
              disconnect(id);
              onDone();
            }}
          />
        </View>
      ) : (
        <View className="mt-5">
          <ConnectButton />
        </View>
      )}
      {id === Provider.Letterboxd && <LetterboxdAdvancedSetup />}
    </>
  );
}
