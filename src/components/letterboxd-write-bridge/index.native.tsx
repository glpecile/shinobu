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
 * Runs Letterboxd writes inside a WebView sharing the native login cookie
 * store; replayed cookies land as signed-out at the origin
 * (docs/solutions/letterboxd-no-api-fallback.md).
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
    // 1x1 off-screen so native layout does not skip loading the WebView (0x0 can be skipped).
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
      {pages.map((page) => (
        <NitroWebView
          key={page.id}
          injectedJavaScriptBeforeContentLoaded={page.script}
          onMessage={callback((event) => handleLetterboxdMessage(event.nativeEvent.data))}
          source={{ uri: `${LETTERBOXD_BASE_URL}${page.path}` }}
          style={{ width: 1, height: 1 }}
        />
      ))}
    </View>
  );
}
