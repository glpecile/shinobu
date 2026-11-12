import { openAuthSessionAsync } from 'expo-web-browser';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { beginHardcoverAuthFlow } from '@/lib/providers/hardcover/authorize';
import { clearHardcoverAuthFlow } from '@/lib/providers/hardcover/auth-flow';
import { hardcoverClientId } from '@/lib/providers/hardcover/config';
import { getHardcoverRedirectUri } from '@/lib/providers/hardcover/redirect-uri';
import { HARDCOVER_GOODREADS_IMPORT_URL } from '@/lib/providers/external-urls';
import { openExternalUrl } from '@/lib/open-external-url';
import { exchangeHardcoverCode } from '@/state/queries/hardcover';

type ConnectionStatus = 'idle' | 'connecting' | 'error';

/**
 * Hardcover's connect button: authorization code with PKCE on the bundled
 * public client id. On native the auth session returns the redirect to this
 * button, which exchanges the code. On web the window goes to Hardcover and
 * comes back to the home route as `?oauth=hardcover&code=…`, where
 * `useOAuthCallback` exchanges it. Also the reconnect path: a new session
 * overwrites one that Hardcover ended.
 */
export function ConnectHardcoverButton() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const clientId = hardcoverClientId();

  async function connect() {
    const redirectUri = getHardcoverRedirectUri();
    setStatus('connecting');
    let url: string;
    try {
      url = await beginHardcoverAuthFlow({ clientId, redirectUri });
    } catch (error) {
      setStatus('error');
      console.error('Hardcover auth flow could not be started', error);
      return;
    }

    if (Platform.OS === 'web') {
      window.location.assign(url);
      return;
    }

    const result = await openAuthSessionAsync(url, redirectUri);
    if (result.type !== 'success') {
      // Cancelled or dismissed. The pending flow ends with it.
      clearHardcoverAuthFlow();
      setStatus('idle');
      return;
    }

    const returned = new URL(result.url).searchParams;
    const code = returned.get('code');
    if (code == null) {
      clearHardcoverAuthFlow();
      setStatus('error');
      return;
    }

    await exchangeHardcoverCode({
      code,
      state: returned.get('state') ?? '',
      iss: returned.get('iss'),
      redirectUri,
    }).then(
      () => setStatus('idle'),
      (error: unknown) => {
        setStatus('error');
        console.error('Hardcover OAuth exchange failed', error);
      },
    );
  }

  if (clientId === '') {
    return (
      <Text className="text-muted font-sans text-sm">
        This build has no Hardcover client id, so it cannot connect Hardcover.
      </Text>
    );
  }

  return (
    <View className="w-full gap-3">
      <Text className="text-muted font-sans text-sm">
        You sign in on Hardcover's own site. Shinobu keeps only the resulting
        tokens on this device and never sees your password.
      </Text>
      <Text className="text-muted font-sans text-sm">
        Coming from Goodreads?{' '}
        <Text
          accessibilityRole="link"
          className="text-accent font-sans-semibold underline"
          onPress={() => void openExternalUrl(HARDCOVER_GOODREADS_IMPORT_URL)}
        >
          Import your Goodreads library into Hardcover
        </Text>{' '}
        first.
      </Text>
      {status === 'error' && (
        <Text className="text-accent font-sans text-xs">
          Could not connect. Tap Connect to try again.
        </Text>
      )}
      <Button
        icon={<Button.Icon name="link-outline" />}
        label="Connect Hardcover"
        loading={status === 'connecting'}
        loadingLabel="Connecting…"
        onPress={() => void connect()}
      />
    </View>
  );
}
