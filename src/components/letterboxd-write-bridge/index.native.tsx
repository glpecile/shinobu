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
 * A hidden bridge that mounts a page WebView per in-flight write, so film and
 * list writes can run *inside* it (plan 0012), and unmounts it once the write
 * settles so no Letterboxd page keeps running in the background. It shares the same WKWebView /
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
  const [pages, setPages] = useState<Array<{ id: string; path: string; script: string }>>([]);

  useEffect(() => {
    registerLetterboxdWebView({
      loadPage: (id, path, script) => setPages((current) => [...current, { id, path, script }]),
      unloadPage: (id) => setPages((current) => current.filter((page) => page.id !== id)),
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
      {/* The native cookie store is shared across instances, so each is signed in. */}
      {pages.map((page) => (
        <NitroWebView
          key={page.id}
          injectedJavaScript={page.script}
          onMessage={callback((event) => handleLetterboxdMessage(event.nativeEvent.data))}
          source={{ uri: `${LETTERBOXD_BASE_URL}${page.path}` }}
          style={{ width: 1, height: 1 }}
        />
      ))}
    </View>
  );
}
