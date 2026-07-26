import { useState } from 'react';
import { Text, View } from 'react-native';
import { Effect } from 'effect';

import {
  ProviderSigninWebView,
  type CookiePair,
} from '@/components/provider-signin-webview';
import { PresstableOpacity } from '@/components/presstable';
import {
  extractSerializdLogin,
  SERIALIZD_SIGN_IN_URL,
  SERIALIZD_WEB_ORIGIN,
  validateAuthToken,
  type CapturedSerializdLogin,
} from '@/lib/providers/serializd';
import { serializdDeps } from '@/state/queries/serializd';
import { connectSerializd } from '@/state/session/serializd';

/**
 * Native Serializd connect (plan 0017 R4): the user signs into serializd.com in
 * a modal WebView and Shinobu harvests the `tvproject_credentials` cookie — its
 * value is the bearer token. Unlike Letterboxd, no password is exchanged and no
 * write bridge is kept; the token replays fine over plain HTTP. The token is
 * validated via `/validateauthtoken` (which also recovers the username) before
 * it's stored. This is the primary connect path — the user types into
 * serializd.com directly, never sending a password to Shinobu.
 */
export function ConnectSerializdButton() {
  const [signingIn, setSigningIn] = useState(false);
  const [status, setStatus] = useState<'idle' | 'validating' | 'error'>('idle');

  const onCaptured = async (captured: CapturedSerializdLogin) => {
    setStatus('validating');
    try {
      const result = await Effect.runPromise(
        validateAuthToken(serializdDeps(), captured.accessToken),
      );
      connectSerializd({ accessToken: result.token, username: result.username });
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <View className="w-full gap-3">
      <Text className="text-muted font-sans text-sm">
        Serializd has no public API, so Shinobu signs you in through a secure web
        view and keeps only the resulting access token on this device — your
        password is never sent to Shinobu.
      </Text>
      {status === 'error' && (
        <Text className="text-accent font-sans text-xs">
          Could not verify your Serializd session. Try signing in again.
        </Text>
      )}
      <PresstableOpacity
        className="bg-accent px-5 py-3 rounded-md"
        disabled={status === 'validating'}
        onPress={() => {
          setStatus('idle');
          setSigningIn(true);
        }}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base text-center">
          {status === 'validating' ? 'Verifying…' : 'Sign in to Serializd'}
        </Text>
      </PresstableOpacity>

      <ProviderSigninWebView<CapturedSerializdLogin>
        cookieDomain={SERIALIZD_WEB_ORIGIN}
        extractSession={(cookies: CookiePair[]) => extractSerializdLogin(cookies)}
        onCaptured={onCaptured}
        onClose={() => setSigningIn(false)}
        title="Sign in to Serializd"
        uri={SERIALIZD_SIGN_IN_URL}
        visible={signingIn}
      />
    </View>
  );
}
