import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ProviderSigninWebView, type CookiePair } from '@/components/provider-signin-webview';
import {
  LETTERBOXD_BASE_URL,
  LETTERBOXD_SIGN_IN_URL,
  captureLoginFromCookies,
  type CapturedLetterboxdLogin,
} from '@/lib/providers/letterboxd';
import { connectLetterboxdSession } from '@/state/session/letterboxd';

/**
 * Letterboxd binds its session cookies to the WebView User-Agent (`captureUserAgent`),
 * and login detection is cookie-based so any post-login redirect works
 * (docs/solutions/letterboxd-no-api-fallback.md).
 */
function storeLetterboxdSession(captured: CapturedLetterboxdLogin) {
  connectLetterboxdSession({
    username: captured.username,
    cookie: captured.session.cookie,
    csrf: captured.session.csrf,
    userAgent: captured.session.userAgent,
  });
}

export function ConnectLetterboxdButton() {
  const [signingIn, setSigningIn] = useState(false);

  return (
    <View className="w-full gap-3">
      <Text className="text-muted font-sans text-sm">
        Letterboxd has no public API, so Shinobu logs your movies by signing in as you in a secure
        web view. Your session stays on this device — no password is ever sent to Shinobu.
      </Text>
      <Button
        icon={<Button.Icon name="link-outline" />}
        label="Sign in to Letterboxd"
        onPress={() => setSigningIn(true)}
      />

      <ProviderSigninWebView<CapturedLetterboxdLogin>
        captureUserAgent
        cookieDomain={LETTERBOXD_BASE_URL}
        extractSession={(cookies: CookiePair[], userAgent?: string) =>
          captureLoginFromCookies(cookies, userAgent)
        }
        onCaptured={storeLetterboxdSession}
        onClose={() => setSigningIn(false)}
        title="Sign in to Letterboxd"
        uri={LETTERBOXD_SIGN_IN_URL}
        visible={signingIn}
      />
    </View>
  );
}
