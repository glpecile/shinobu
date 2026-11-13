import { useMutation } from '@tanstack/react-query';
import { openAuthSessionAsync } from 'expo-web-browser';
import { Platform, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { beginHardcoverAuthFlow } from '@/lib/providers/hardcover/authorize';
import { clearHardcoverAuthFlow } from '@/lib/providers/hardcover/auth-flow';
import { hardcoverClientId } from '@/lib/providers/hardcover/config';
import { getHardcoverRedirectUri } from '@/lib/providers/hardcover/redirect-uri';
import { HARDCOVER_GOODREADS_IMPORT_URL } from '@/lib/providers/external-urls';
import { openExternalUrl } from '@/lib/open-external-url';
import { exchangeHardcoverCode } from '@/state/queries/hardcover';

/**
 * Hardcover's connect button: authorization code with PKCE on the bundled
 * public client id. On native the auth session returns the redirect to this
 * button, which exchanges the code. On web the window goes to Hardcover and
 * comes back to the home route as `?oauth=hardcover&code=…`, where
 * `useOAuthCallback` exchanges it. Also the reconnect path: a new session
 * overwrites one that can't refresh again.
 */
export function ConnectHardcoverButton() {
  const clientId = hardcoverClientId();
  const connect = useMutation({
    // Never paused offline: a connect that can't reach Hardcover fails now.
    networkMode: 'always',
    mutationFn: async () => {
      const redirectUri = getHardcoverRedirectUri();
      const url = await beginHardcoverAuthFlow({ clientId, redirectUri });

      if (Platform.OS === 'web') {
        window.location.assign(url);
        return;
      }

      const result = await openAuthSessionAsync(url, redirectUri);
      if (result.type !== 'success') {
        // Cancelled or dismissed. The pending flow ends with it.
        clearHardcoverAuthFlow();
        return;
      }

      const returned = new URL(result.url).searchParams;
      const code = returned.get('code');
      if (code == null) {
        clearHardcoverAuthFlow();
        throw new Error('Hardcover returned no authorization code');
      }

      await exchangeHardcoverCode({
        code,
        state: returned.get('state') ?? '',
        iss: returned.get('iss'),
        redirectUri,
      });
    },
    onError: (error) => console.error('Hardcover connect failed', error),
  });

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
      {connect.isError && (
        <Text className="text-accent font-sans text-xs">
          Could not connect. Tap Connect to try again.
        </Text>
      )}
      <Button
        icon={<Button.Icon name="link-outline" />}
        label="Connect Hardcover"
        loading={connect.isPending}
        loadingLabel="Connecting…"
        onPress={() => connect.mutate()}
      />
    </View>
  );
}
