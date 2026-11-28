import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ProviderSigninWebView, type CookiePair } from '@/components/provider-signin-webview';
import {
  extractSerializdLogin,
  SERIALIZD_SIGN_IN_URL,
  SERIALIZD_WEB_ORIGIN,
  type CapturedSerializdLogin,
} from '@/lib/providers/serializd';
import { validateSerializdToken } from '@/state/queries/serializd';
import { connectSerializd } from '@/state/session/serializd';

export function ConnectSerializdButton() {
  const [signingIn, setSigningIn] = useState(false);
  const [status, setStatus] = useState<'idle' | 'validating' | 'error'>('idle');

  const onCaptured = async (captured: CapturedSerializdLogin) => {
    setStatus('validating');
    try {
      connectSerializd(await validateSerializdToken(captured.accessToken));
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <View className="w-full gap-3">
      <Text className="text-muted font-sans text-sm">
        Serializd has no public API, so Shinobu signs you in through a secure web view and keeps
        only the resulting access token on this device — your password is never sent to Shinobu.
      </Text>
      {status === 'error' && (
        <Text className="text-accent font-sans text-xs" role="alert">
          Could not verify your Serializd session. Try signing in again.
        </Text>
      )}
      <Button
        icon={<Button.Icon name="link-outline" />}
        label="Sign in to Serializd"
        loading={status === 'validating'}
        loadingLabel="Verifying…"
        onPress={() => {
          setStatus('idle');
          setSigningIn(true);
        }}
      />

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
