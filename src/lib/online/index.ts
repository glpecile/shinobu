import { onlineManager } from '@tanstack/react-query';
import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';

/**
 * Tells TanStack Query when the device has no network, which React Native
 * cannot report on its own. Offline, reads pause and resume on reconnect, and
 * a log goes to the pending queue. Call once, before the first render.
 *
 * Only a missing network counts as offline. `isInternetReachable` also turns
 * false on a captive portal or a slow probe, and a wrong "offline" would pause
 * every read in the app.
 */
export function watchConnectivity(): void {
  onlineManager.setEventListener((setOnline) => {
    const apply = (state: { isConnected?: boolean }) => setOnline(state.isConnected !== false);
    void getNetworkStateAsync().then(apply, () => {});
    const subscription = addNetworkStateListener(apply);
    return () => subscription.remove();
  });
}
