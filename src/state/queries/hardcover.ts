import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { httpFetch } from '@/lib/http/client';
import {
  exchangeHardcoverCode as exchangeHardcoverCodeForSession,
  revokeHardcoverSession,
} from '@/lib/providers/hardcover/auth';
import type { HardcoverDeps } from '@/lib/providers/hardcover/deps';
import {
  getBookEntry,
  getBookIdBySlug,
  getViewer,
  searchBooks,
  type HardcoverBookHit,
} from '@/lib/providers/hardcover/reads';
import type { TokenStore } from '@/lib/providers/token-store';
import { Provider } from '@/lib/providers/types';
import { getClientIdForProvider } from '@/state/session/provider-config';
import {
  clearProviderSession,
  getProviderSession,
  setProviderSession,
} from '@/state/session/tokens';
import type { NormalizedMediaItem } from '@/types/media';
import type { ProviderSession } from '@/types/session';

import { SEARCH_MIN_QUERY_LENGTH } from './trakt';

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
  searchRoot: () => [...hardcoverQueryKeys.all, 'search'] as const,
  search: (query: string) => [...hardcoverQueryKeys.searchRoot(), query] as const,
  bookSlug: (slug: string) => [...hardcoverQueryKeys.all, 'book-slug', slug] as const,
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

/**
 * Books by title for the search tab's Books section. The caller enables it
 * only while Hardcover is connected. Every request counts against the
 * per-token budget, so a cached query string is never refetched.
 */
export function useHardcoverBookSearchQuery(params: { query: string; enabled: boolean }) {
  const query = params.query.trim();
  return useQuery({
    queryKey: hardcoverQueryKeys.search(query),
    queryFn: ({ signal }) =>
      Effect.runPromise(searchBooks(hardcoverDeps(), { query, perPage: 20 }), { signal }),
    enabled: params.enabled && query.length >= SEARCH_MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** A Books search result's item, for the details screen's cache-only resolution chain. */
export function findInHardcoverSearchCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  for (const [, hits] of queryClient.getQueriesData<HardcoverBookHit[]>({
    queryKey: hardcoverQueryKeys.searchRoot(),
  })) {
    const found = Array.isArray(hits) ? hits.find((hit) => hit?.item?.id === id) : undefined;
    if (found != null) return found.item;
  }
  return undefined;
}

/** The book id behind an incoming `hardcover.app/books/{slug}` link; null when no book has it. */
export function useHardcoverBookIdBySlugQuery(slug: string | null) {
  return useQuery({
    queryKey: hardcoverQueryKeys.bookSlug(slug ?? ''),
    queryFn: ({ signal }) =>
      Effect.runPromise(getBookIdBySlug(hardcoverDeps(), slug ?? ''), { signal }),
    enabled: slug != null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
