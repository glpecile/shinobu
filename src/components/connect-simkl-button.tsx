import { openAuthSessionAsync } from 'expo-web-browser';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { Button } from '@/components/button';
import {
  beginSimklAuthFlow,
  clearSimklAuthFlow,
} from '@/lib/providers/simkl/auth';
import { getSimklRedirectUri } from '@/lib/providers/simkl/redirect-uri';
import { exchangeSimklCode } from '@/state/queries/simkl';
import { getClientIdForProvider } from '@/state/session/provider-config';

type ConnectionStatus = 'idle' | 'connecting' | 'error';

/**
 * Simkl's OAuth trigger, without any of its UI.
 *
 * One-tap by design (plan 0034 U5): the app ships a public PKCE client id
 * (`EXPO_PUBLIC_SIMKL_CLIENT_ID` — no secret exists, KTD-1), so there is no
 * BYO wizard and no Steps. `beginSimklAuthFlow` persists the PKCE
 * verifier/state pair for the return leg. On native, auth opens in an embedded
 * browser session and this hook finishes the code exchange from the returned
 * URL — the same in-button return handling as Trakt's code flow; the exchange
 * validates `state` against the persisted flow internally. On web, the current
 * window navigates to Simkl and comes back to the home route as
 * `?oauth=simkl&code=…`, where `useOAuthCallback` exchanges it.
 *
 * Extracted so the Manage Trackers row can connect in one tap without opening
 * a sheet whose only content would be this button; the button below consumes
 * the same hook, so there is exactly one copy of the flow.
 */
export function useSimklConnect() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');

  const clientId = getClientIdForProvider('simkl');
  const redirectUri = getSimklRedirectUri();

  async function connect() {
    if (clientId === '') return;

    setStatus('connecting');
    let url: string;
    try {
      url = await beginSimklAuthFlow({ clientId, redirectUri });
    } catch (error) {
      setStatus('error');
      console.error('Simkl auth flow could not be started', error);
      return;
    }

    if (Platform.OS === 'web') {
      // Same-window redirect: Simkl sends the user back to the home route
      // with ?oauth=simkl&code=..., where useOAuthCallback exchanges it. This
      // avoids popup blockers and orphaned auth windows (the Trakt shape).
      window.location.assign(url);
      return;
    }

    const result = await openAuthSessionAsync(url, redirectUri);
    if (result.type !== 'success') {
      // User-cancelled/dismissed — not an error worth alarming about. The
      // pending PKCE flow is dead with it; don't leave it around to validate
      // some future stray code.
      clearSimklAuthFlow();
      setStatus('idle');
      return;
    }

    const returned = new URL(result.url);
    const code = returned.searchParams.get('code');
    const state = returned.searchParams.get('state');
    if (code == null) {
      // Simkl redirected back without a code (?error=...): a real failure.
      clearSimklAuthFlow();
      setStatus('error');
      return;
    }

    try {
      await exchangeSimklCode({ code, state: state ?? '', redirectUri });
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      console.error('Simkl OAuth exchange failed', error);
    }
  }

  return {
    connect,
    status,
    clientId,
    /** True only when this build ships no client id — nothing to tap through. */
    needsSetup: clientId === '',
  };
}

export function ConnectSimklButton() {
  const { connect, status, clientId } = useSimklConnect();

  if (clientId === '') {
    // No BYO path exists for Simkl (plan 0034 U5) — a build without the
    // bundled id has nothing to connect with, so say so instead of rendering
    // a button that can only dead-tap.
    return (
      <Text className="text-muted font-sans text-sm text-center">
        This build ships no Simkl client id — set EXPO_PUBLIC_SIMKL_CLIENT_ID
        and rebuild to connect.
      </Text>
    );
  }

  return (
    <View className="items-center gap-3">
      {status === 'error' && (
        <Text className="text-accent font-sans text-sm text-center">
          Could not connect. Tap Connect to try again.
        </Text>
      )}
      <Button
        label="Connect Simkl"
        loading={status === 'connecting'}
        loadingLabel="Connecting…"
        onPress={() => void connect()}
      />
    </View>
  );
}
