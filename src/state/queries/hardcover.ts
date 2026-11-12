import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { httpFetch } from '@/lib/http/client';
import {
  exchangeHardcoverCode as exchangeHardcoverCodeForSession,
  revokeHardcoverSession,
} from '@/lib/providers/hardcover/auth';
import type { HardcoverDeps } from '@/lib/providers/hardcover/deps';
import type { HardcoverLibraryEntry } from '@/lib/providers/hardcover/normalize';
import {
  getBookEntry,
  getBookIdBySlug,
  getLibrary,
  getViewer,
  HardcoverStatus,
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
  /** Want to Read, Currently Reading and Read, with progress. */
  shelves: () => [...hardcoverQueryKeys.libraryRoot(), 'shelves'] as const,
  /** Continue Reading's settled slice of `shelves`. */
  reading: () => [...hardcoverQueryKeys.libraryRoot(), 'reading'] as const,
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
 * The connected member. Cached forever, like the other providers' viewer
 * reads: disconnect purges the `['hardcover']` root.
 */
export function hardcoverViewerQuery() {
  return {
    queryKey: hardcoverQueryKeys.viewer(),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      Effect.runPromise(getViewer(hardcoverDeps()), { signal }),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  };
}

/** The connected member's username for Manage Trackers. */
export function useHardcoverUsernameQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    ...hardcoverViewerQuery(),
    enabled: options.enabled,
    select: (viewer) => viewer.username,
  });
}

/**
 * A library changes when the reader changes it, and Shinobu's own writes
 * invalidate `libraryRoot`, so this covers edits on hardcover.app.
 */
const LIBRARY_STALE_MS = 15 * 60_000;

/** The one library read behind Continue Reading, the reading list and details. */
function fetchHardcoverShelves(queryClient: QueryClient): Promise<HardcoverLibraryEntry[]> {
  return queryClient.fetchQuery({
    queryKey: hardcoverQueryKeys.shelves(),
    queryFn: ({ signal }) => Effect.runPromise(getLibrary(hardcoverDeps()), { signal }),
    staleTime: LIBRARY_STALE_MS,
  });
}

/** Currently Reading books for Continue Reading. */
export async function fetchHardcoverReading(queryClient: QueryClient): Promise<NormalizedMediaItem[]> {
  const entries = await fetchHardcoverShelves(queryClient);
  return entries.flatMap((entry) => (entry.statusId === HardcoverStatus.Reading ? [entry.item] : []));
}

/** Want to Read books for the reading list. Read and Currently Reading books are not on it. */
export async function fetchHardcoverWantToRead(
  queryClient: QueryClient,
): Promise<HardcoverLibraryEntry[]> {
  const entries = await fetchHardcoverShelves(queryClient);
  return entries.filter((entry) => entry.statusId === HardcoverStatus.WantToRead);
}

/** A library book's item, with its progress, for the details screen's cache-only resolution chain. */
export function findInHardcoverLibraryCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  return queryClient
    .getQueryData<HardcoverLibraryEntry[]>(hardcoverQueryKeys.shelves())
    ?.find((entry) => entry.item.id === id)?.item;
}

/**
 * Books by title for the search tab's Books section. The caller enables it
 * only while Hardcover is connected. Every request counts against the
 * per-token budget, so a query string is never refetched in a session.
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
