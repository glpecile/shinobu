import { View } from 'react-native';
import { useEffect, useState } from 'react';
import { NitroWebView, callback } from 'nitro-webview';

import { LETTERBOXD_BASE_URL } from '@/lib/providers/letterboxd';
import {
  handleLetterboxdMessage,
  registerLetterboxdWebView,
} from '@/lib/providers/letterboxd/webview-bridge';
import { useHasLetterboxdWriteSession } from '@/state/session/letterboxd';

/**
 * A hidden bridge that mounts a fresh film WebView for each write so diary
 * writes can run *inside* it (plan 0012). It shares the same WKWebView /
 * Android cookie store the login flow populated, so it is authenticated without
 * any cookie replay — the one thing that works, since replayed cookies land as
 * signed-out at the origin (docs/solutions/letterboxd-no-api-fallback.md).
 *
 * Mounted once at the app root (`app/_layout.tsx`) and rendered only while a
 * write session exists, so disconnecting tears the WebView (and its live
 * session) down. Web uses the optional userscript transport instead.
 */
export function LetterboxdWriteBridge() {
  const hasSession = useHasLetterboxdWriteSession();
  return hasSession ? <ConnectedWriteBridge /> : null;
}

function ConnectedWriteBridge() {
  const [page, setPage] = useState<{ filmPath: string; script: string } | null>(null);

  useEffect(() => {
    registerLetterboxdWebView({
      loadFilmPage: (filmPath, script) => setPage({ filmPath, script }),
    });
    return () => registerLetterboxdWebView(null);
  }, []);

  return (
    // Off-screen and untouchable, but still laid out so the WebView actually
    // loads (a 0x0 view can be skipped). Kept out of the a11y tree.
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
        left: -9999,
      }}
    >
      <NitroWebView
        // A new instance installs the script before loading, including repeat
        // logs of the same film. The native cookie store survives remounts.
        key={page?.script ?? 'idle'}
        injectedJavaScript={page?.script}
        onMessage={callback((event) => handleLetterboxdMessage(event.nativeEvent.data))}
        source={{ uri: `${LETTERBOXD_BASE_URL}${page?.filmPath ?? '/'}` }}
        style={{ width: 1, height: 1 }}
      />
    </View>
  );
}
