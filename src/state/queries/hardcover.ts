import { useQuery } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { httpFetch } from '@/lib/http/client';
import {
  exchangeHardcoverCode as exchangeHardcoverCodeForSession,
  revokeHardcoverSession,
} from '@/lib/providers/hardcover/auth';
import type { HardcoverDeps } from '@/lib/providers/hardcover/deps';
import { getBookEntry, getViewer } from '@/lib/providers/hardcover/reads';
import type { TokenStore } from '@/lib/providers/token-store';
import { Provider } from '@/lib/providers/types';
import { getClientIdForProvider } from '@/state/session/provider-config';
import {
  clearProviderSession,
  getProviderSession,
  setProviderSession,
} from '@/state/session/tokens';
import type { ProviderSession } from '@/types/session';

// One store object for the app: the refresh single-flight is keyed by its identity.
const tokenStore: TokenStore = {
  get: () => getProviderSession(Provider.Hardcover),
  set: (session) => setProviderSession(Provider.Hardcover, session),
  clear: () => clearProviderSession(Provider.Hardcover),
};

/**
 * Web Locks where the platform has them, which is every browser Shinobu
 * supports and no native runtime. Session storage on web is `localStorage`,
 * so the tab that waited reads the token the first tab stored.
 */
const refreshLock: HardcoverDeps['refreshLock'] = (run) =>
  typeof navigator !== 'undefined' && navigator.locks != null
    ? (navigator.locks.request('shinobu-hardcover-refresh', run) as ReturnType<typeof run>)
    : run();

/** Real dependency wiring for Hardcover effects, the same on web and native. */
export function hardcoverDeps(): HardcoverDeps {
  return {
    fetch: httpFetch,
    tokens: tokenStore,
    clientId: getClientIdForProvider(Provider.Hardcover),
    refreshLock,
  };
}

/** Authorization-code exchange at the Effect boundary. Success stores the session. */
export function exchangeHardcoverCode(params: {
  code: string;
  state: string;
  iss: string | null;
  redirectUri: string;
}): Promise<ProviderSession> {
  return Effect.runPromise(exchangeHardcoverCodeForSession(hardcoverDeps(), params));
}

/**
 * Ends the stored session on Hardcover. Call it before the session is
 * cleared. A failure is dropped: disconnect must work offline, and the member
 * can still end the session from Hardcover's Authorized Apps page.
 */
export function revokeHardcover(): void {
  const session = getProviderSession(Provider.Hardcover);
  if (session == null) return;
  void Effect.runPromise(revokeHardcoverSession(hardcoverDeps(), session)).catch(() => {});
}

export const hardcoverQueryKeys = {
  all: [Provider.Hardcover] as const,
  viewer: () => [...hardcoverQueryKeys.all, 'viewer'] as const,
  /** Every read of the viewer's library. A log or a reading-list write invalidates this prefix. */
  libraryRoot: () => [...hardcoverQueryKeys.all, 'library'] as const,
  bookEntry: (bookId: number) => [...hardcoverQueryKeys.libraryRoot(), 'entry', bookId] as const,
};

/** The viewer's library entry for one book: its status, the read in progress and the page count. */
export function hardcoverBookEntryQuery(bookId: number) {
  return {
    queryKey: hardcoverQueryKeys.bookEntry(bookId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      Effect.runPromise(getBookEntry(hardcoverDeps(), bookId), { signal }),
  };
}

export function useHardcoverBookEntryQuery(params: { bookId: number | undefined; enabled?: boolean }) {
  const { bookId, enabled = true } = params;
  return useQuery({
    ...hardcoverBookEntryQuery(bookId ?? 0),
    enabled: enabled && bookId != null,
  });
}

/**
 * The connected member's username for Manage Trackers. Cached forever, like
 * the other providers' viewer reads: disconnect purges the `['hardcover']` root.
 */
export function useHardcoverUsernameQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: hardcoverQueryKeys.viewer(),
    queryFn: ({ signal }) => Effect.runPromise(getViewer(hardcoverDeps()), { signal }),
    enabled: options.enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    select: (viewer) => viewer.username,
  });
}
