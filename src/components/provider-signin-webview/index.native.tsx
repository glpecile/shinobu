import { useRef } from 'react';
import { Modal, Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NitroWebView,
  callback,
  type NitroWebViewType,
  type WebViewMessageEvent,
  type WebViewNavigationState,
} from 'nitro-webview';

import { PresstableOpacity } from '@/components/presstable';

// Page-load injection avoids Nitro's off-main-thread iOS evaluateJavaScript call.
const CAPTURE_USER_AGENT_SCRIPT = `
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'shinobu-user-agent',
    value: navigator.userAgent
  }));
  true;
`;

export interface CookiePair {
  name: string;
  value: string;
}

interface ProviderSigninWebViewProps<T> {
  /** Controlled visibility — the parent owns the trigger button + open state. */
  visible: boolean;
  onClose: () => void;
  /** Modal header + cancel a11y label. */
  title: string;
  /** The sign-in page to load (e.g. serializd.com/login). */
  uri: string;
  /** Cookie jar to read on every settled navigation (e.g. the site's base URL). */
  cookieDomain: string;
  /**
   * Turn the cookie jar (and optionally the WebView User-Agent) into a
   * provider-specific captured payload, or `null` while the user hasn't
   * finished signing in. The shape is the provider's own (Serializd: a token;
   * Letterboxd: cookie + CSRF + UA) — this component never inspects it (KTD5).
   */
  extractSession: (cookies: CookiePair[], userAgent?: string) => T | null;
  onCaptured: (captured: T) => void;
  /** Read the WebView's User-Agent before extracting (Letterboxd binds to it). */
  captureUserAgent?: boolean;
}

/**
 * The shared provider sign-in surface (plan 0017 KTD5): a modal WebView that
 * polls the cookie jar on every settled navigation and fires `onCaptured` once
 * the provider's `extractSession` returns a payload. Extracted from the
 * Letterboxd connect button so both it and Serializd ride the same one-shot
 * capture mechanics — detection is cookie-based, not URL-based, so a post-login
 * redirect anywhere is expected. The web variant (index.tsx) renders null.
 */
export function ProviderSigninWebView<T>({
  visible,
  onClose,
  title,
  uri,
  cookieDomain,
  extractSession,
  onCaptured,
  captureUserAgent = false,
}: ProviderSigninWebViewProps<T>) {
  const webViewRef = useRef<NitroWebViewType | null>(null);
  // The capture must fire exactly once even though several navigation events
  // race after login. Reset when each open mounts a fresh WebView.
  const capturedRef = useRef(false);
  const userAgentRef = useRef<string | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const injectUserAgent = captureUserAgent && Platform.OS === 'ios';

  const tryCapture = async () => {
    if (capturedRef.current) return;
    if (injectUserAgent && userAgentRef.current == null) return;
    const ref = webViewRef.current;
    if (ref == null) return;

    const cookies = await ref.getCookies(cookieDomain);
    let userAgent = userAgentRef.current;
    if (captureUserAgent && !injectUserAgent) {
      try {
        userAgent = await ref.evaluateJavaScript('navigator.userAgent');
      } catch {
        userAgent = undefined;
      }
    }
    if (capturedRef.current || webViewRef.current !== ref || !visible) return;
    const captured = extractSession(cookies, userAgent);
    // Not signed in yet — leave the WebView open for the user to finish.
    if (captured == null) return;

    capturedRef.current = true;
    onCaptured(captured);
    onClose();
  };

  const onNavigationStateChange = (state: WebViewNavigationState) => {
    // `loading` guards against reading a half-written cookie jar mid-nav.
    if (!state.loading) void tryCapture();
  };

  const onMessage = (event: WebViewMessageEvent) => {
    if (!injectUserAgent) return;
    try {
      const host = new URL(event.nativeEvent.url).hostname;
      const domain = new URL(cookieDomain).hostname;
      if (host !== domain && !host.endsWith(`.${domain}`)) return;
      const message: unknown = JSON.parse(event.nativeEvent.data);
      if (
        message == null ||
        typeof message !== 'object' ||
        !('type' in message) ||
        message.type !== 'shinobu-user-agent' ||
        !('value' in message) ||
        typeof message.value !== 'string' ||
        message.value.trim() === ''
      ) return;
      userAgentRef.current = message.value;
    } catch {
      return;
    }
    // The message can arrive after load-end, so either event can finish capture.
    void tryCapture();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      {/* React Native's `Modal` hosts its children in a *separate* native view
          hierarchy, which the app-level `GestureHandlerRootView` in
          `app/_layout.tsx` does not reach — so every gesture-handler pressable
          inside a Modal is dead until its own root wraps it. That is why the
          Cancel button did nothing: it's a pressto (RNGH) pressable, and there
          was no handler root above it. */}
      {/* Plain `style`, no className — uniwind drops className on third-party
          components on native
          (docs/solutions/uniwind-classname-third-party-components.md). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          className="flex-1 bg-background"
          style={{ paddingTop: insets.top }}
        >
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
            <Text className="text-foreground font-sans-semibold text-base">{title}</Text>
            <PresstableOpacity
              accessibilityLabel={`Cancel ${title}`}
              className="px-3 py-1.5"
              onPress={onClose}
            >
              <Text className="text-accent font-sans-semibold text-sm">Cancel</Text>
            </PresstableOpacity>
          </View>
          {visible && (
            <NitroWebView
              injectedJavaScript={injectUserAgent ? CAPTURE_USER_AGENT_SCRIPT : undefined}
              // Nitro dispatches event props across the JSI boundary — each one
              // must be wrapped in callback(...) or it throws at render time.
              onLoadEnd={callback(() => void tryCapture())}
              onNavigationStateChange={callback(onNavigationStateChange)}
              onMessage={injectUserAgent ? callback(onMessage) : undefined}
              source={{ uri }}
              style={{ flex: 1 }}
              hybridRef={callback((ref) => {
                webViewRef.current = ref;
                capturedRef.current = false;
                userAgentRef.current = undefined;
              })}
            />
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
