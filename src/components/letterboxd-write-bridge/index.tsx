/**
 * Web has no Letterboxd write path (writes run inside a native WebView, plan
 * 0012), so the bridge renders nothing. The platform-native variant lives in
 * `index.native.tsx`; the bundler picks it on iOS/Android.
 */
export function LetterboxdWriteBridge() {
  return null;
}
