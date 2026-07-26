import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  ProviderSigninWebView,
  type CookiePair,
} from '@/components/provider-signin-webview';
import { PresstableOpacity } from '@/components/presstable';
import {
  LETTERBOXD_BASE_URL,
  LETTERBOXD_SIGN_IN_URL,
  captureLoginFromCookies,
  type CapturedLetterboxdLogin,
} from '@/lib/providers/letterboxd';
import { connectLetterboxdSession } from '@/state/session/letterboxd';

/**
 * Native Letterboxd connect (plan 0012, session-capture write path): Letterboxd
 * has no API, so the user signs in through a real WebView and Shinobu harvests
 * the resulting session cookies — the username (`letterboxd.signed.in.as`) plus
 * the Cookie header + CSRF token + User-Agent that authorize diary writes.
 *
 * Migrated (plan 0017 KTD5) onto the shared `ProviderSigninWebView` — the same
 * modal + cookie-poll mechanics Serializd uses. Letterboxd's `extractSession`
 * returns its provider-specific cookie+CSRF+UA payload (`captureUserAgent` on,
 * since the origin binds the session to the UA); the component stays agnostic to
 * that shape. Detection is cookie-based, not URL-based, so a post-login redirect
 * anywhere is expected (docs/solutions/letterboxd-no-api-fallback.md).
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
        Letterboxd has no public API, so Shinobu logs your movies by signing in
        as you in a secure web view. Your session stays on this device — no
        password is ever sent to Shinobu.
      </Text>
      <PresstableOpacity
        className="bg-accent px-5 py-3 rounded-md"
        onPress={() => setSigningIn(true)}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base text-center">
          Sign in to Letterboxd
        </Text>
      </PresstableOpacity>

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
