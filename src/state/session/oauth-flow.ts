import { createMMKV } from 'react-native-mmkv';

/**
 * The pending web OAuth flow for Trakt and AniList. A web OAuth return is
 * honoured only when this browser started that flow: the connect button stores
 * the request `state` here before redirecting, and the return leg
 * (`use-oauth-callback.ts`) takes it. Taking always removes the entry, so a
 * replayed or restored URL finds nothing and does nothing.
 *
 * Its own MMKV instance id (like `simkl/auth-flow.ts`), so writing it never
 * fires `onSessionChange` listeners mid-OAuth. Web falls back to localStorage.
 */
const flowStorage = createMMKV({ id: 'oauth-flow' });

/** Longer than any consent screen, short enough that a stale tab can't use it. */
const FLOW_MAX_AGE_MS = 15 * 60 * 1000;

type PendingOAuthProvider = 'trakt' | 'anilist';

export function beginOAuthFlow(provider: PendingOAuthProvider, state: string): void {
  flowStorage.set(provider, JSON.stringify({ state, startedAt: Date.now() }));
}

/** The pending flow's `state`, consumed: `null` when none or expired. */
export function takeOAuthFlow(provider: PendingOAuthProvider): string | null {
  const raw = flowStorage.getString(provider);
  flowStorage.remove(provider);
  if (raw == null) return null;
  const { state, startedAt } = JSON.parse(raw) as { state: string; startedAt: number };
  return Date.now() - startedAt <= FLOW_MAX_AGE_MS ? state : null;
}
