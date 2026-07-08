import {
  ResponseType,
  useAuthRequest,
} from 'expo-auth-session';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Effect } from 'effect';
import { Linking, Platform } from 'react-native';

import { exchangeCodeForSession } from '@/lib/providers/trakt/auth';
import type { ProviderSession } from '@/types/session';
import { TRAKT_AUTHORIZE_URL } from '@/lib/providers/trakt/config';
import { getTraktRedirectUri } from '@/lib/providers/trakt/redirectUri';
import { traktDeps } from '@/state/queries/trakt';
import { useProviderClientId } from '@/state/session/use-provider-client-id';

const discovery = {
  authorizationEndpoint: TRAKT_AUTHORIZE_URL,
  tokenEndpoint: 'https://api.trakt.tv/oauth/token',
};

type ConnectionStatus = 'idle' | 'connecting' | 'error';

function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<ProviderSession> {
  return Effect.runPromise(
    exchangeCodeForSession(traktDeps(), { code, redirectUri }),
  );
}

/**
 * Trakt OAuth trigger. The client id is entered in-app (no env-file edits).
 * On native, auth opens in an embedded browser session via expo-web-browser
 * and returns to the app. On web, the current window navigates to Trakt and
 * is redirected back with ?code=..., which the mount handler exchanges.
 */
export function ConnectTraktButton() {
  const [storedClientId, saveClientId, clearClientId] = useProviderClientId(
    'trakt',
  );
  const [inputValue, setInputValue] = useState(storedClientId ?? '');
  const [status, setStatus] = useState<ConnectionStatus>('idle');

  const clientId = storedClientId ?? '';
  const redirectUri = getTraktRedirectUri();

  // On web the OAuth popup may redirect the main window back with ?code=...
  // instead of returning through openAuthSessionAsync. Handle that on mount.
  useEffect(() => {
    if (typeof window === 'undefined' || clientId === '') return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code == null) return;

    // Remove the code from the URL so a refresh does not re-trigger exchange.
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    window.history.replaceState({}, '', url.toString());

    setStatus('connecting');
    exchangeCode(code, redirectUri)
      .then(() => setStatus('idle'))
      .catch((error) => {
        setStatus('error');
        console.error('Trakt OAuth exchange failed', error);
      });
  }, [clientId, redirectUri]);

  const [request] = useAuthRequest(
    {
      clientId,
      responseType: ResponseType.Code,
      redirectUri,
      // Trakt does not support PKCE; including code_challenge causes the
      // authorization endpoint to reject the request.
      usePKCE: false,
    },
    discovery,
  );

  async function connect() {
    if (request?.url == null) return;

    if (Platform.OS === 'web') {
      // On web the most reliable flow is a same-window redirect: Trakt sends
      // the user back to the app with ?code=..., and the mount handler above
      // exchanges it. This avoids popup blockers and orphaned auth windows.
      window.location.assign(request.url);
      return;
    }

    setStatus('connecting');
    const result = await openAuthSessionAsync(request.url, redirectUri);
    if (result.type !== 'success') {
      setStatus('idle');
      return;
    }

    const url = new URL(result.url);
    const code = url.searchParams.get('code');
    if (code == null) {
      setStatus('idle');
      return;
    }

    exchangeCode(code, redirectUri)
      .then(() => setStatus('idle'))
      .catch((error) => {
        setStatus('error');
        console.error('Trakt OAuth exchange failed', error);
      });
  }

  if (clientId === '') {
    return (
      <View className="w-full gap-3">
        <Text className="text-muted font-sans text-sm">
          Paste your Trakt Client ID from{" "}
          <Text
            className="text-accent font-sans-semibold underline"
            onPress={() =>
              Linking.openURL("https://trakt.tv/oauth/applications/new")
            }
          >
            trakt.tv/oauth/applications
          </Text>
          .
        </Text>
        <Text className="text-muted font-sans text-xs">
          Register this redirect URI:{" "}
          <Text className="text-foreground font-sans-semibold">
            {redirectUri}
          </Text>
        </Text>
        <TextInput
          className="border border-border bg-surface text-foreground px-4 py-3 rounded font-sans"
          onChangeText={setInputValue}
          placeholder="Trakt Client ID"
          placeholderTextColor="#666666"
          value={inputValue}
        />
        <Pressable
          className="bg-accent px-5 py-3 rounded active:opacity-80"
          onPress={() => saveClientId(inputValue.trim())}
        >
          <Text className="text-accent-foreground font-sans-semibold text-base text-center">
            Save Client ID
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="items-center gap-3">
      {status === 'connecting' && (
        <Text className="text-muted font-sans text-sm">
          Connecting to Trakt…
        </Text>
      )}
      {status === 'error' && (
        <Text className="text-accent font-sans text-sm text-center">
          Could not connect. Tap Connect to try again.
        </Text>
      )}
      <Pressable
        className="bg-accent px-5 py-3 rounded active:opacity-80"
        disabled={status === 'connecting'}
        onPress={() => connect()}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base">
          {status === 'connecting' ? 'Connecting…' : 'Connect Trakt'}
        </Text>
      </Pressable>
      <Pressable onPress={() => clearClientId()}>
        <Text className="text-muted font-sans text-xs">Edit Client ID</Text>
      </Pressable>
    </View>
  );
}
