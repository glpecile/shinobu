import { useMutation, useQueryClient, useSuspenseQuery, type InfiniteData } from '@tanstack/react-query';
import { Effect } from 'effect';

import { searchTitlesFuzzy } from '@/lib/providers/tmdb/fuzzy-search';
import { searchMedia } from '@/lib/providers/trakt/reads';
import { createList, renameList, setListMembership, type LetterboxdListDraft, type LetterboxdListFilmsPage } from '@/lib/providers/letterboxd/lists';
import { createSerializdList, renameSerializdList, setSerializdListMembership, type SerializdListDraft } from '@/lib/providers/serializd/lists';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import type { NormalizedMediaItem } from '@/types/media';
import { letterboxdDeps, letterboxdQueryKeys } from './letterboxd';
import { serializdDeps, serializdQueryKeys } from './serializd';
import { tmdbDeps, tmdbQueryKeys } from './tmdb';
import { traktDeps, traktQueryKeys } from './trakt';

export type ListEditTarget = {
  username: string;
  title: string;
  url: string;
} & ({ provider: 'letterboxd'; owner: string; slug: string } | { provider: 'serializd'; id: string });

/** Confirm upstream first, update mounted pages, then reconcile detail and index reads. */
export function useListMembership(target: ListEditTarget) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['list-membership', target.provider, target.username, target.url],
    scope: { id: `list-membership/${target.provider}/${target.username}/${target.url}` },
    retry: false,
    mutationFn: async (params: { item: NormalizedMediaItem; present: boolean; entryId?: string }) => {
      switch (target.provider) {
        case 'letterboxd': {
          if (getLetterboxdUsername()?.toLowerCase() !== target.username.toLowerCase()) throw new Error('Your Letterboxd account changed. Reopen the list.');
          const receipt = await Effect.runPromise(setListMembership(letterboxdDeps(), { ...target, ...params }));
          return { provider: 'letterboxd' as const, receipt };
        }
        case 'serializd':
          return { provider: 'serializd' as const, list: await Effect.runPromise(setSerializdListMembership(serializdDeps(target.username), { ...target, ...params })) };
      }
    },
    onSuccess: async (result, params) => {
      switch (target.provider) {
        case 'letterboxd': {
          if (result.provider !== 'letterboxd' || getLetterboxdUsername()?.toLowerCase() !== target.username.toLowerCase()) return;
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
        case 'serializd': {
          if (result.provider !== 'serializd' || !serializdDeps(target.username).session) return;
          const key = serializdQueryKeys.list(target.username, target.id);
          await client.cancelQueries({ queryKey: key, exact: true });
          client.setQueryData(key, result.list);
          await Promise.all([
            client.invalidateQueries({ queryKey: key }),
            client.invalidateQueries({ queryKey: serializdQueryKeys.listsRoot() }),
          ]);
        }
      }
    },
  });
}

/** A Letterboxd rename can move the list to a new slug; callers follow `slug`. */
export function useRenameList(target: ListEditTarget) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['list-rename', target.provider, target.username, target.url],
    retry: false,
    mutationFn: async (name: string) => {
      switch (target.provider) {
        case 'letterboxd':
          if (getLetterboxdUsername()?.toLowerCase() !== target.username.toLowerCase()) throw new Error('Your Letterboxd account changed. Reopen the list.');
          return { provider: 'letterboxd' as const, ...await Effect.runPromise(renameList(letterboxdDeps(), { owner: target.owner, slug: target.slug, name })) };
        case 'serializd': {
          const list = await Effect.runPromise(renameSerializdList(serializdDeps(target.username), { id: target.id, username: target.username, name }));
          client.setQueryData(serializdQueryKeys.list(target.username, target.id), list);
          return { provider: 'serializd' as const, name: list.title };
        }
      }
    },
    onSuccess: async (result) => {
      switch (result.provider) {
        case 'letterboxd':
          if (target.provider === 'letterboxd' && result.slug === target.slug) {
            client.setQueryData<InfiniteData<LetterboxdListFilmsPage>>(letterboxdQueryKeys.listFilms(target.owner, target.slug), (data) => data == null ? data : { ...data, pages: data.pages.map((page) => ({ ...page, title: result.name })) });
          }
          await client.invalidateQueries({ queryKey: letterboxdQueryKeys.listsRoot() });
          return;
        case 'serializd':
          await client.invalidateQueries({ queryKey: serializdQueryKeys.listsRoot() });
      }
    },
  });
}

export type NewList =
  | { provider: 'letterboxd'; draft: LetterboxdListDraft }
  | { provider: 'serializd'; draft: SerializdListDraft };

/** Never retried: an unconfirmed create may still have saved upstream. */
export function useCreateList(username: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['list-create', username],
    retry: false,
    mutationFn: async (list: NewList) => {
      switch (list.provider) {
        case 'letterboxd':
          if (getLetterboxdUsername()?.toLowerCase() !== username.toLowerCase()) throw new Error('Your Letterboxd account changed. Reopen this screen.');
          return { provider: 'letterboxd' as const, ...await Effect.runPromise(createList(letterboxdDeps(), list.draft)) };
        case 'serializd': {
          const created = await Effect.runPromise(createSerializdList(serializdDeps(username), { ...list.draft, username }));
          client.setQueryData(serializdQueryKeys.list(username, created.id), created);
          return { provider: 'serializd' as const, id: created.id };
        }
      }
    },
    onSuccess: (result) => client.invalidateQueries({ queryKey: result.provider === 'letterboxd' ? letterboxdQueryKeys.listsRoot() : serializdQueryKeys.listsRoot() }),
  });
}

/** Reuses the search tab's cache and provider fallback. */
export function useSuspenseListSearchQuery(query: string, source: 'tmdb' | 'trakt') {
  return useSuspenseQuery({
    queryKey: source === 'tmdb' ? tmdbQueryKeys.search(query) : traktQueryKeys.search(query, 20),
    queryFn: ({ signal }) => source === 'tmdb'
      ? Effect.runPromise(searchTitlesFuzzy(tmdbDeps(), { query }), { signal })
      : Effect.runPromise(searchMedia(traktDeps(), { query, limit: 20 }), { signal }),
    staleTime: 60_000,
  });
}
