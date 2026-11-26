export interface CookiePair {
  name: string;
  value: string;
}

export function ProviderSigninWebView<T>(_props: {
  visible: boolean;
  onClose: () => void;
  title: string;
  uri: string;
  cookieDomain: string;
  extractSession: (cookies: CookiePair[], userAgent?: string) => T | null;
  onCaptured: (captured: T) => void;
  captureUserAgent?: boolean;
}): null {
  return null;
}
