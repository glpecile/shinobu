import type { ReactNode } from 'react';

/**
 * On iOS, mounting expo-router/head activates Handoff user activities and
 * throws unless `origin` is set on the expo-router config plugin
 * (docs/solutions/expo-router-head-ios-handoff.md).
 */
export default function Head(_props: { children?: ReactNode }) {
  return null;
}
