import { createMMKV } from 'react-native-mmkv';

/**
 * The in-flight PKCE material: transient, one flow at a time, deleted the
 * moment the exchange settles. MMKV-backed like `state/session/tokens.ts`
 * (localStorage fallback on web) but under its own instance id so writing it
 * never fires `onSessionChange` listeners mid-OAuth.
 *
 * In its own module (not `auth.ts`) on purpose: `auth.ts` imports expo-crypto
 * for the S256 derivation, and `state/session/index.ts` needs *only* the
 * flow-clearing side of disconnect (plan 0034 U5) — routing that import
 * through `auth.ts` would drag the whole expo package into every module (and
 * bun test graph) that touches the session layer.
 */
const flowStorage = createMMKV({ id: 'simkl-auth-flow' });
const FLOW_KEY = 'simklAuthFlow';

export interface SimklAuthFlow {
  verifier: string;
  state: string;
}

export function saveSimklAuthFlow(flow: SimklAuthFlow): void {
  flowStorage.set(FLOW_KEY, JSON.stringify(flow));
}

export function getSimklAuthFlow(): SimklAuthFlow | null {
  const raw = flowStorage.getString(FLOW_KEY);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as SimklAuthFlow;
  } catch {
    flowStorage.remove(FLOW_KEY);
    return null;
  }
}

export function clearSimklAuthFlow(): void {
  flowStorage.remove(FLOW_KEY);
}
