import { useEffect, useRef } from 'react';
import { Modal, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NitroWebView,
  callback,
  type NitroWebViewType,
  type WebViewNavigationState,
} from 'nitro-webview';

import { PresstableOpacity } from '@/components/presstable';

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
  // race after login. Reset each time the modal (re)opens.
  const capturedRef = useRef(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) capturedRef.current = false;
  }, [visible]);

  const tryCapture = async () => {
    if (capturedRef.current) return;
    const ref = webViewRef.current;
    if (ref == null) return;

    const cookies = await ref.getCookies(cookieDomain);
    let userAgent: string | undefined;
    if (captureUserAgent) {
      try {
        userAgent = await ref.evaluateJavaScript('navigator.userAgent');
      } catch {
        userAgent = undefined;
      }
    }
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
              // Nitro dispatches event props across the JSI boundary — each one
              // must be wrapped in callback(...) or it throws at render time.
              onLoadEnd={callback(() => void tryCapture())}
              onNavigationStateChange={callback(onNavigationStateChange)}
              source={{ uri }}
              style={{ flex: 1 }}
              hybridRef={callback((ref) => {
                webViewRef.current = ref;
              })}
            />
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
