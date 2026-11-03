import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { expect, mock, test } from 'bun:test';
import type { ReactNode } from 'react';

GlobalRegistrator.register();
const { fireEvent, render, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
let requestPermission = async (): Promise<{ granted: boolean }> => { throw new Error('Permission request failed'); };
let refresh = async () => {};
const errors: string[] = [];
mock.module('expo-notifications', () => ({ requestPermissionsAsync: () => requestPermission() }));
mock.module('@react-native-vector-icons/ionicons/static', () => ({ default: () => null }));
mock.module('@/lib/theme-color', () => ({ useThemeColor: () => undefined }));
mock.module('@/lib/toast', () => ({ toast: { error: (title: string) => errors.push(title) } }));
const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
mock.module('@/components/rail-head', () => ({ RailHead: { Icon: Container, Count: Container } }));
mock.module('@/components/button', () => ({ Button: () => null }));
mock.module('@/features/settings/settings-rail', () => ({
  SettingsRail: { Section: Container, Head: Container, Row: Container, Lead: Container, Text: Container, Title: Container, Subtitle: Container },
}));
mock.module('@/components/native-switch', () => ({
  NativeSwitch: ({ accessibilityLabel, disabled, onValueChange }: { accessibilityLabel: string; disabled: boolean; onValueChange: (next: boolean) => void }) =>
    <button aria-label={accessibilityLabel} disabled={disabled} onClick={() => onValueChange(true)} />,
}));
mock.module('@/state/prefs/notifications', () => ({
  getMutedNotificationKinds: () => new Set(), setNotificationKindMuted() {}, setNotificationsEnabled() {},
  useNotificationKindEnabled: () => true, useNotificationsEnabled: () => false,
}));
mock.module('@/state/prefs/storage', () => ({ prefsStorage: { addOnValueChangedListener: () => ({ remove() {} }) } }));
mock.module('@/state/queries/up-next', () => ({ upNextQueryKeys: { inputs: () => [] } }));
mock.module('@/features/notifications/refresh', () => ({ createRefreshDeps: () => ({}), refreshNotifications: () => refresh() }));
mock.module('@/features/notifications/scheduler', () => ({ cancelAllScheduledNotifications: async () => {}, scheduleTestNotification: async () => {} }));
Object.assign(globalThis, { __DEV__: false });
const { NotificationsSettingsSection } = await import('./index.native');

test('permission and scheduling failures keep Settings mounted and allow retry', async () => {
  const client = new QueryClient();
  const view = render(<QueryClientProvider client={client}><NotificationsSettingsSection /></QueryClientProvider>);
  try {
    const toggle = view.getByRole('button', { name: 'Release alerts' });
    fireEvent.click(toggle);
    await waitFor(() => expect(errors).toHaveLength(1));
    await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(false));
    requestPermission = async () => ({ granted: true });
    refresh = async () => { throw new Error('Scheduling failed'); };
    fireEvent.click(toggle);
    await waitFor(() => expect(errors).toHaveLength(2));
    await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(false));
    refresh = async () => {};
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(false));
    expect(view.getByText('Release alerts')).toBeDefined();
    expect(errors).toEqual(['Could not update notifications', 'Could not update notifications']);
  } finally {
    view.unmount();
    client.clear();
  }
});
