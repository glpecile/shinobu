import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { CARD_SHELL } from '@/components/card-shell';
import { cn } from '@/lib/cn';
import { useTraktNeedsCredentials } from '@/state/session';

/**
 * Dismissal survives navigation but not an app relaunch (plan 0034 R13:
 * the banner is "dismiss-until-next-launch", persistent otherwise) —
 * module state on purpose, never MMKV.
 */
let dismissedThisLaunch = false;

/**
 * The MigrationNeeded banner (plan 0034 U9, state diagram in the Planning
 * Contract): shown while a stored Trakt token has no resolvable client id —
 * the state every existing user lands in after R12 removed the bundled
 * credentials. Reads degrade silently everywhere else (Trakt is simply gated
 * out of `useConnectedProviders`), so this is the one surface that says why,
 * and its action routes into the guided BYO setup (`onReconnect` opens the
 * Trakt provider sheet). Completing that setup runs a fresh OAuth exchange,
 * which overwrites the dead token and flips `useTraktNeedsCredentials` off.
 */
export function TraktMigrationBanner({ onReconnect }: { onReconnect: () => void }) {
  const needsCredentials = useTraktNeedsCredentials();
  const [dismissed, setDismissed] = useState(dismissedThisLaunch);

  if (!needsCredentials || dismissed) return null;

  return (
    <View className={cn(CARD_SHELL, 'border-accent gap-3')}>
      <Text className="text-foreground font-sans-semibold text-base">
        Trakt now requires your own API app — reconnect to resume syncing
      </Text>
      <Text className="text-muted font-sans text-sm">
        Your Trakt history is untouched. Shinobu no longer ships shared Trakt
        credentials, so syncing is paused until you connect with your own
        (free) Trakt API app.
      </Text>
      <View className="flex-row items-center gap-3">
        <Button label="Reconnect Trakt" onPress={onReconnect} size="sm" />
        <Button
          label="Not now"
          onPress={() => {
            dismissedThisLaunch = true;
            setDismissed(true);
          }}
          size="sm"
          variant="quiet"
        />
      </View>
    </View>
  );
}
