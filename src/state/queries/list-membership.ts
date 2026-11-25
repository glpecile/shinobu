import { useMutation, useQueryClient, useSuspenseQuery, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { enrichExternalIds } from '@/features/log-media/enrich';
import { addBookToHardcoverList, createHardcoverList, deleteHardcoverList, removeBookFromHardcoverList, updateHardcoverList, type HardcoverListDraft } from '@/lib/providers/hardcover/list-writes';
import { searchTitlesFuzzy } from '@/lib/providers/tmdb/fuzzy-search';
import { searchMedia } from '@/lib/providers/trakt/reads';
import { createList, renameList, setListMembership, type LetterboxdListDraft, type LetterboxdListFilmsPage } from '@/lib/providers/letterboxd/lists';
import { createSerializdList, renameSerializdList, setSerializdListMembership, type SerializdListDraft } from '@/lib/providers/serializd/lists';
import { Provider } from '@/lib/providers/types';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import type { NormalizedMediaItem } from '@/types/media';
import { hardcoverDeps, hardcoverQueryKeys } from './hardcover';
import { letterboxdDeps, letterboxdQueryKeys } from './letterboxd';
import { serializdDeps, serializdQueryKeys } from './serializd';
import { tmdbDeps, tmdbQueryKeys } from './tmdb';
import { traktDeps, traktQueryKeys } from './trakt';

export type ListEditTarget = {
  username: string;
  title: string;
  url: string;
} & ({ provider: typeof Provider.Letterboxd; owner: string; slug: string } | { provider: typeof Provider.Serializd; id: string } | { provider: typeof Provider.Hardcover; id: string });

/** Confirm upstream first, update mounted pages, then reconcile detail and index reads. */
export function useListMembership(target: ListEditTarget) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['list-membership', target.provider, target.username, target.url],
    scope: { id: `list-membership/${target.provider}/${target.username}/${target.url}` },
    retry: false,
    mutationFn: async ({ item: listed, ...params }: { item: NormalizedMediaItem; present: boolean; entryId?: string }) => {
      const item = await enrichExternalIds(client, listed, [target.provider]);
      switch (target.provider) {
        case Provider.Letterboxd: {
          if (getLetterboxdUsername()?.toLowerCase() !== target.username.toLowerCase()) throw new Error('Your Letterboxd account changed. Reopen the list.');
          const receipt = await Effect.runPromise(setListMembership(letterboxdDeps(), { ...target, ...params, item }));
          return { provider: Provider.Letterboxd, receipt };
        }
        case Provider.Serializd:
          return { provider: Provider.Serializd, list: await Effect.runPromise(setSerializdListMembership(serializdDeps(target.username), { ...target, ...params, item })) };
        case Provider.Hardcover:
          if (params.present) {
            await Effect.runPromise(addBookToHardcoverList(hardcoverDeps(), { listId: Number(target.id), item }));
          } else {
            // A removal names the `list_books` row, which only a list read knows.
            if (params.entryId == null) throw new Error('Reopen the list to remove this book.');
            await Effect.runPromise(removeBookFromHardcoverList(hardcoverDeps(), Number(params.entryId)));
          }
          return { provider: Provider.Hardcover };
      }
    },
    onSuccess: async (result, params) => {
      switch (target.provider) {
        case Provider.Letterboxd: {
          if (result.provider !== Provider.Letterboxd || getLetterboxdUsername()?.toLowerCase() !== target.username.toLowerCase()) return;
          const key = letterboxdQueryKeys.listFilms(target.owner, target.slug);
          await client.cancelQueries({ queryKey: key, exact: true });
          const slug = result.receipt.filmSlug;
          const item = { ...params.item, id: `letterboxd-${slug}`, externalIds: { ...params.item.externalIds, letterboxd: slug } };
          client.setQueryData<InfiniteData<LetterboxdListFilmsPage>>(key, (data) => {
            if (!data?.pages.length) return data;
            if (params.present && data.pages.some((page) => page.items.some((film) => film.externalIds.letterboxd === slug || film.id === item.id))) return data;
            const pages = data.pages.map((page) => ({ ...page, items: page.items.filter((film) => film.externalIds.letterboxd !== slug && film.id !== item.id) }));
            if (params.present) pages[pages.length - 1].items.push(item);
            return { ...data, pages };
          });
          await Promise.all([
            // A prefix refetch cannot include a film appended beyond its loaded pages.
            client.invalidateQueries({ queryKey: key, refetchType: params.present ? 'none' : 'active' }),
            client.invalidateQueries({ queryKey: letterboxdQueryKeys.listsRoot() }),
          ]);
          return;
        }
        case Provider.Serializd: {
          if (result.provider !== Provider.Serializd || !serializdDeps(target.username).session) return;
          const key = serializdQueryKeys.list(target.username, target.id);
          await client.cancelQueries({ queryKey: key, exact: true });
          client.setQueryData(key, result.list);
          await Promise.all([
            client.invalidateQueries({ queryKey: key }),
            client.invalidateQueries({ queryKey: serializdQueryKeys.listsRoot() }),
          ]);
          return;
        }
        case Provider.Hardcover:
          await invalidateHardcoverList(client, target.id);
      }
    },
  });
}

function invalidateHardcoverList(client: QueryClient, id: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: hardcoverQueryKeys.list(Number(id)) }),
    client.invalidateQueries({ queryKey: hardcoverQueryKeys.listsRoot() }),
  ]);
}

/**
 * A Letterboxd rename can move the list to a new slug; callers follow `slug`.
 * `description` is saved only on Hardcover, and left as it is when absent.
 */
export function useRenameList(target: ListEditTarget) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['list-rename', target.provider, target.username, target.url],
    scope: { id: `list-membership/${target.provider}/${target.username}/${target.url}` },
    retry: false,
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      switch (target.provider) {
        case Provider.Hardcover:
          return { provider: Provider.Hardcover, ...await Effect.runPromise(updateHardcoverList(hardcoverDeps(), { id: Number(target.id), name, description })) };
        case Provider.Letterboxd:
          if (getLetterboxdUsername()?.toLowerCase() !== target.username.toLowerCase()) throw new Error('Your Letterboxd account changed. Reopen the list.');
          return { provider: Provider.Letterboxd, ...await Effect.runPromise(renameList(letterboxdDeps(), { owner: target.owner, slug: target.slug, name })) };
        case Provider.Serializd: {
          const list = await Effect.runPromise(renameSerializdList(serializdDeps(target.username), { id: target.id, username: target.username, name }));
          client.setQueryData(serializdQueryKeys.list(target.username, target.id), list);
          return { provider: Provider.Serializd, name: list.title };
        }
      }
    },
    onSuccess: async (result) => {
      switch (result.provider) {
        case Provider.Letterboxd:
          if (target.provider === Provider.Letterboxd && result.slug === target.slug) {
            client.setQueryData<InfiniteData<LetterboxdListFilmsPage>>(letterboxdQueryKeys.listFilms(target.owner, target.slug), (data) => data == null ? data : { ...data, pages: data.pages.map((page) => ({ ...page, title: result.name })) });
          }
          await client.invalidateQueries({ queryKey: letterboxdQueryKeys.listsRoot() });
          return;
        case Provider.Serializd:
          await client.invalidateQueries({ queryKey: serializdQueryKeys.listsRoot() });
          return;
        case Provider.Hardcover:
          if (target.provider === Provider.Hardcover) await invalidateHardcoverList(client, target.id);
      }
    },
  });
}

/** Deleting is Hardcover's only: the other providers' lists are deleted on their sites. */
export function useDeleteHardcoverList(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['list-delete', Provider.Hardcover, id],
    retry: false,
    mutationFn: () => Effect.runPromise(deleteHardcoverList(hardcoverDeps(), Number(id))),
    onSuccess: () => {
      // Removed, not invalidated: a refetch of a deleted list is a 404.
      client.removeQueries({ queryKey: hardcoverQueryKeys.list(Number(id)) });
      return client.invalidateQueries({ queryKey: hardcoverQueryKeys.listsRoot() });
    },
  });
}

export type NewList =
  | { provider: typeof Provider.Letterboxd; draft: LetterboxdListDraft }
  | { provider: typeof Provider.Serializd; draft: SerializdListDraft }
  | { provider: typeof Provider.Hardcover; draft: HardcoverListDraft };

/** Never retried: an unconfirmed create may still have saved upstream. */
export function useCreateList(username: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['list-create', username],
    retry: false,
    mutationFn: async (list: NewList) => {
      const items = await Promise.all(list.draft.items.map((item) => enrichExternalIds(client, item, [list.provider])));
      switch (list.provider) {
        case Provider.Letterboxd:
          if (getLetterboxdUsername()?.toLowerCase() !== username.toLowerCase()) throw new Error('Your Letterboxd account changed. Reopen this screen.');
          return { provider: Provider.Letterboxd, ...await Effect.runPromise(createList(letterboxdDeps(), { ...list.draft, items })) };
        case Provider.Serializd: {
          const created = await Effect.runPromise(createSerializdList(serializdDeps(username), { ...list.draft, items, username }));
          client.setQueryData(serializdQueryKeys.list(username, created.id), created);
          return { provider: Provider.Serializd, id: created.id };
        }
        case Provider.Hardcover:
          // `failed` names the books Hardcover did not take; the list itself was created.
          return { provider: Provider.Hardcover, ...await Effect.runPromise(createHardcoverList(hardcoverDeps(), { ...list.draft, items })) };
      }
    },
    onSuccess: (result) => {
      switch (result.provider) {
        case Provider.Letterboxd:
          return client.invalidateQueries({ queryKey: letterboxdQueryKeys.listsRoot() });
        case Provider.Serializd:
          return client.invalidateQueries({ queryKey: serializdQueryKeys.listsRoot() });
        case Provider.Hardcover:
          return client.invalidateQueries({ queryKey: hardcoverQueryKeys.listsRoot() });
      }
    },
  });
}

/** Reuses the search tab's cache and provider fallback. */
export function useSuspenseListSearchQuery(query: string, source: 'tmdb' | typeof Provider.Trakt) {
  return useSuspenseQuery({
    queryKey: source === 'tmdb' ? tmdbQueryKeys.search(query) : traktQueryKeys.search(query, 20),
    queryFn: ({ signal }) => source === 'tmdb'
      ? Effect.runPromise(searchTitlesFuzzy(tmdbDeps(), { query }), { signal })
      : Effect.runPromise(searchMedia(traktDeps(), { query, limit: 20 }), { signal }),
    staleTime: 60_000,
  });
}
