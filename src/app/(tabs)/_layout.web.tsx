import { Slot } from 'expo-router';

/**
 * Web has no bottom tab bar — navigation lives in the persistent left sidebar
 * (`components/app-shell`, mounted at the root). This group's layout is a plain
 * passthrough so the tab screens render directly into that shell.
 */
export default function TabsWebLayout() {
  return <Slot />;
}
