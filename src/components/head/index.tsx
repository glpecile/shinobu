import type { ReactNode } from 'react';

/**
 * Native no-op — the web variant (index.web.tsx) renders expo-router/head.
 * On iOS, mounting expo-router/head activates Handoff user activities and
 * throws unless an `origin` is set on the expo-router config plugin
 * (docs/solutions/expo-router-head-ios-handoff.md). Shinobu only wants
 * browser-tab titles and meta tags, so on native Head renders nothing.
 */
export default function Head(_props: { children?: ReactNode }) {
  return null;
}
