import type { ReactNode } from 'react';
import { View } from 'react-native';

export function AppShell({ children }: { children: ReactNode }) {
  return <View className="flex-1">{children}</View>;
}
