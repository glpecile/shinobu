import { useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NitroWebView,
  callback,
  type NitroWebViewType,
  type WebViewNavigationState,
} from 'nitro-webview';

import { PresstableOpacity } from '@/components/presstable';
import {
  LETTERBOXD_BASE_URL,
  LETTERBOXD_SIGN_IN_URL,
  captureLoginFromCookies,
} from '@/lib/providers/letterboxd';
import { connectLetterboxdSession } from '@/state/session/letterboxd';

/**
 * Native Letterboxd connect (plan 0012, session-capture write path): Letterboxd
 * has no API, so the user signs in through a real WebView and Shinobu harvests
 * the resulting session cookies — the username (`letterboxd.signed.in.as`) plus
 * the Cookie header + CSRF token that authorize diary writes. This *is* the
 * connection: unlike web (read-only username), native gets full write access.
 *
 * Detection is cookie-based, not URL-based: after login Letterboxd redirects
 * wherever it likes, so on every settled navigation we re-read the cookie jar
 * and finish the moment the signed-in marker appears
 * (docs/solutions/letterboxd-no-api-fallback.md).
 */
export function ConnectLetterboxdButton() {
  const [signingIn, setSigningIn] = useState(false);
  const webViewRef = useRef<NitroWebViewType | null>(null);
  // Recycling isn't a concern (this isn't a list row) — but the capture must
  // fire exactly once even though several navigation events race after login.
  const capturedRef = useRef(false);
  const insets = useSafeAreaInsets();

  const open = () => {
    capturedRef.current = false;
    setSigningIn(true);
  };
  const close = () => {
    setSigningIn(false);
    webViewRef.current = null;
  };

  const tryCapture = async () => {
    if (capturedRef.current) return;
    const ref = webViewRef.current;
    if (ref == null) return;

    const cookies = await ref.getCookies(LETTERBOXD_BASE_URL);
    const captured = captureLoginFromCookies(cookies);
    // Not signed in yet — leave the WebView open for the user to finish.
    if (captured == null) return;

    capturedRef.current = true;
    connectLetterboxdSession({
      username: captured.username,
      cookie: captured.session.cookie,
      csrf: captured.session.csrf,
    });
    close();
  };

  const onNavigationStateChange = (state: WebViewNavigationState) => {
    // Fires on every URL/history change; the post-login redirect is one of
    // them. `loading` guards against reading a half-written cookie jar mid-nav.
    if (!state.loading) void tryCapture();
  };

  return (
    <View className="w-full gap-3">
      <Text className="text-muted font-sans text-sm">
        Letterboxd has no public API, so Shinobu logs your movies by signing in
        as you in a secure web view. Your session stays on this device — no
        password is ever sent to Shinobu.
      </Text>
      <PresstableOpacity
        className="bg-accent px-5 py-3 rounded"
        onPress={open}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base text-center">
          Sign in to Letterboxd
        </Text>
      </PresstableOpacity>

      <Modal
        animationType="slide"
        onRequestClose={close}
        presentationStyle="pageSheet"
        visible={signingIn}
      >
        <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
            <Text className="text-foreground font-sans-semibold text-base">
              Sign in to Letterboxd
            </Text>
            <PresstableOpacity
              accessibilityLabel="Cancel Letterboxd sign in"
              className="px-3 py-1.5"
              onPress={close}
            >
              <Text className="text-accent font-sans-semibold text-sm">
                Cancel
              </Text>
            </PresstableOpacity>
          </View>
          {signingIn && (
            <NitroWebView
              // Nitro dispatches event props across the JSI boundary — each one
              // must be wrapped in callback(...) or it throws at render time.
              onLoadEnd={callback(() => void tryCapture())}
              onNavigationStateChange={callback(onNavigationStateChange)}
              source={{ uri: LETTERBOXD_SIGN_IN_URL }}
              style={{ flex: 1 }}
              hybridRef={callback((ref) => {
                webViewRef.current = ref;
              })}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
