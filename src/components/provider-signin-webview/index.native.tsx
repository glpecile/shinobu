import { useRef } from 'react';
import { Modal, Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  NitroWebView,
  callback,
  type NitroWebViewType,
  type WebViewMessageEvent,
  type WebViewNavigationState,
} from 'nitro-webview';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';

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
  visible: boolean;
  onClose: () => void;
  title: string;
  uri: string;
  cookieDomain: string;
  extractSession: (cookies: CookiePair[], userAgent?: string) => T | null;
  onCaptured: (captured: T) => void;
  captureUserAgent?: boolean;
}

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
  // Nitro's `callback()` wraps handlers that read refs while rendering, which
  // React Compiler rejects. A sign-in sheet opened once gains nothing from memo.
  'use no memo';
  const webViewRef = useRef<NitroWebViewType | null>(null);
  const capturedRef = useRef(false);
  const userAgentRef = useRef<string | undefined>(undefined);
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
    if (captured == null) return;

    capturedRef.current = true;
    onCaptured(captured);
    onClose();
  };

  const onNavigationStateChange = (state: WebViewNavigationState) => {
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
      )
        return;
      userAgentRef.current = message.value;
    } catch {
      return;
    }
    void tryCapture();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      {/* Modal has a separate native hierarchy: its close button needs its own
          gesture root. */}
      {/* Plain `style`, no className — uniwind drops className on third-party
          components on native
          (docs/solutions/uniwind-classname-third-party-components.md). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-background">
          {/* Insets come from the modal's own window, not the app root's: an
              iOS pageSheet card already starts below the status bar, but iPad
              Slide Over presents it full screen. */}
          <SafeAreaView edges={['top']}>
            <View className="px-4 py-3 border-b border-border">
              <Sheet.Header className="items-center" onClose={onClose}>
                <View className="flex-row items-center gap-3">
                  <Text className="flex-1 text-foreground font-sans-semibold text-base">
                    {title}
                  </Text>
                  <Button
                    className="shrink-0"
                    icon={<Button.Icon name="refresh" />}
                    iconOnly
                    label="Reload page"
                    onPress={() => webViewRef.current?.reload()}
                    shape="pill"
                    variant="quiet"
                  />
                </View>
              </Sheet.Header>
            </View>
          </SafeAreaView>
          {visible && (
            <NitroWebView
              injectedJavaScript={injectUserAgent ? CAPTURE_USER_AGENT_SCRIPT : undefined}
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
