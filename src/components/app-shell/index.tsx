import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * Native has a bottom tab bar (`app/(tabs)/_layout.tsx`), so the shell is just
 * the flex root that holds the navigator — the web sidebar variant lives in
 * `index.web.tsx`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return <View className="flex-1">{children}</View>;
}
