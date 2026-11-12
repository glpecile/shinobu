import { createMMKV } from 'react-native-mmkv';

/**
 * The in-flight PKCE material for one Hardcover connect, removed when the
 * exchange settles. Its own MMKV instance, like `simkl/auth-flow.ts`, so a
 * write never fires `onSessionChange` mid-OAuth, and its own module so the
 * session layer can clear a flow without importing expo-crypto.
 */
const flowStorage = createMMKV({ id: 'hardcover-auth-flow' });
const FLOW_KEY = 'hardcoverAuthFlow';

export interface HardcoverAuthFlow {
  verifier: string;
  state: string;
}

export function saveHardcoverAuthFlow(flow: HardcoverAuthFlow): void {
  flowStorage.set(FLOW_KEY, JSON.stringify(flow));
}

export function getHardcoverAuthFlow(): HardcoverAuthFlow | null {
  const raw = flowStorage.getString(FLOW_KEY);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as HardcoverAuthFlow;
  } catch {
    flowStorage.remove(FLOW_KEY);
    return null;
  }
}

export function clearHardcoverAuthFlow(): void {
  flowStorage.remove(FLOW_KEY);
}
