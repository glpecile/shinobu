import { View } from 'react-native';
import { NitroWebView, callback } from 'nitro-webview';

import { LETTERBOXD_BASE_URL } from '@/lib/providers/letterboxd';
import {
  handleLetterboxdMessage,
  registerLetterboxdWebView,
  setLetterboxdWebViewLoaded,
} from '@/lib/providers/letterboxd/webview-bridge';
import { useHasLetterboxdWriteSession } from '@/state/session/letterboxd';

/**
 * A hidden, always-mounted WebView that stays signed in to letterboxd.com so
 * diary writes can run *inside* it (plan 0012). It shares the same WKWebView /
 * Android cookie store the login flow populated, so it is authenticated without
 * any cookie replay — the one thing that works, since replayed cookies land as
 * signed-out at the origin (docs/solutions/letterboxd-no-api-fallback.md).
 *
 * Mounted once at the app root (`app/_layout.tsx`) and rendered only while a
 * write session exists, so disconnecting tears the WebView (and its live
 * session) down. Web renders nothing — writes there are unsupported.
 */
export function LetterboxdWriteBridge() {
  const hasSession = useHasLetterboxdWriteSession();
  if (!hasSession) return null;

  return (
    // Off-screen and untouchable, but still laid out so the WebView actually
    // loads (a 0x0 view can be skipped). Kept out of the a11y tree.
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999 }}
    >
      <NitroWebView
        onLoadEnd={callback(() => setLetterboxdWebViewLoaded(true))}
        onLoadStart={callback(() => setLetterboxdWebViewLoaded(false))}
        onMessage={callback((event) => handleLetterboxdMessage(event.nativeEvent.data))}
        source={{ uri: `${LETTERBOXD_BASE_URL}/` }}
        style={{ width: 1, height: 1 }}
        hybridRef={callback((ref) => registerLetterboxdWebView(ref))}
      />
    </View>
  );
}
