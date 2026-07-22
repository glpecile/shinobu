export interface CookiePair {
  name: string;
  value: string;
}

/**
 * Web/default: there is no WebView sign-in on web — providers connect via a
 * form (Serializd) or a public username (Letterboxd). Renders nothing so call
 * sites can mount it unconditionally. The real modal lives in index.native.tsx.
 */
export function ProviderSigninWebView<T>(
  _props: {
    visible: boolean;
    onClose: () => void;
    title: string;
    uri: string;
    cookieDomain: string;
    extractSession: (cookies: CookiePair[], userAgent?: string) => T | null;
    onCaptured: (captured: T) => void;
    captureUserAgent?: boolean;
  },
): null {
  return null;
}
