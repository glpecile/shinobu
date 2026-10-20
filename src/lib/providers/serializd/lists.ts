import { DateTime, Effect, Schema } from 'effect';

import { ProviderAuthError, ProviderDecodeError } from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';

export type SerializdListKind = 'created' | 'liked';

const Id = Schema.Int.check(Schema.isGreaterThan(0));
const Page = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9999 }));
// `..` inside a username would be rejected by the web proxy's path check, so a
// valid-looking account would read on native and 404 on web — exclude it here.
const Username = Schema.String.check(Schema.isPattern(/^(?!.*\.\.)[A-Za-z0-9_.-]{1,100}$/));
const ListId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,14}$/));
const RawItem = Schema.Struct({
  showId: Id,
  showName: Schema.String,
  bannerImage: Schema.optional(Schema.NullOr(Schema.String)),
  seasonId: Schema.optional(Schema.NullOr(Id)),
  season: Schema.optional(Schema.NullOr(Schema.Struct({
    seasonNumber: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    name: Schema.optional(Schema.String),
    posterPath: Schema.optional(Schema.NullOr(Schema.String)),
  }))),
  episode: Schema.optional(Schema.NullOr(Schema.Struct({
    // Episode 0 is real (specials, pilots, anime specials); rejecting it would
    // fail the whole list decode. The episode route redirects episode 0 to the
    // show's details, so it degrades instead of breaking the list.
    episode_number: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    name: Schema.optional(Schema.String),
  }))),
});
const RawList = Schema.Struct({
  listId: Id,
  listName: Schema.String,
  owner: Schema.Struct({ username: Username }),
  numberOfItems: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  listItems: Schema.Array(RawItem),
});
const RawIndex = Schema.Struct({
  lists: Schema.Array(RawList),
  totalPages: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9999 })),
});

export interface SerializdListEntry {
  id: string;
  item: NormalizedMediaItem;
  subtitle: string;
  season?: number;
  episode?: number;
}

export interface SerializdList {
  id: string;
  title: string;
  owner: string;
  itemCount: number;
  previews: NormalizedMediaItem[];
}

export function serializdListsUrl(username: string): string | null {
  if (!Schema.is(Username)(username)) return null;
  // The web client shows created and liked as tabs on one page; `/liked_lists`
  // is an API path only, so a liked index can't deep-link its tab.
  return `https://www.serializd.com/user/${encodeURIComponent(username)}/lists`;
}

export function serializdListUrl(id: string): string | null {
  if (!Schema.is(ListId)(id)) return null;
  return `https://www.serializd.com/list/${id}`;
}

function normalizeEntry(raw: typeof RawItem.Type, fetchedAt: string): SerializdListEntry {
  const season = raw.season?.seasonNumber;
  const episode = raw.episode?.episode_number;
  const poster = raw.season?.posterPath || raw.bannerImage;
  // Identity must never collapse onto the show entry: a season whose payload
  // omits `seasonId` falls back to its season number so `1396/1/` stays
  // distinct from the show's `1396//` (and an episode's `1396/1/2`).
  const seasonKey = raw.seasonId ?? raw.season?.seasonNumber ?? '';
  return {
    id: `${raw.showId}/${seasonKey}/${episode ?? ''}`,
    subtitle: [raw.season?.name, episode != null ? `Episode ${episode}` : null, raw.episode?.name].filter(Boolean).join(' · ') || 'Series',
    ...(season != null ? { season } : {}),
    ...(episode != null ? { episode } : {}),
    item: {
      id: `tmdb-tv-${raw.showId}`,
      title: raw.showName,
      coverImage: poster ? `https://image.tmdb.org/t/p/w342${poster}` : '',
      type: 'TV',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: fetchedAt,
      externalIds: { tmdb: raw.showId },
    },
  };
}

function normalizeList(raw: typeof RawList.Type, fetchedAt: string): SerializdList {
  return {
    id: String(raw.listId), title: raw.listName, owner: raw.owner.username,
    itemCount: raw.numberOfItems,
    previews: raw.listItems.slice(0, 5).map((entry) => normalizeEntry(entry, fetchedAt).item),
  };
}

export const getSerializdListsPage = Effect.fn('serializd.getListsPage')(function* (
  deps: SerializdDeps,
  params: { username: string; kind: SerializdListKind; page: number },
) {
  if (serializdListsUrl(params.username) == null || !Schema.is(Page)(params.page)) {
    return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'invalid lists address' });
  }
  const path = `/user/${encodeURIComponent(params.username)}/${params.kind === 'liked' ? 'liked_lists?sort_by=liked_on_desc' : 'lists?sort_by=date_created_desc'}&page=${params.page}`;
  const raw = yield* serializdHttp<unknown>(deps, path, { auth: deps.session != null });
  const page = yield* Schema.decodeUnknownEffect(RawIndex)(raw).pipe(
    Effect.mapError(() => new ProviderDecodeError({ provider: 'serializd', detail: 'unrecognized lists page' })),
  );
  const fetchedAt = DateTime.formatIso(yield* DateTime.now);
  return { lists: page.lists.map((list) => normalizeList(list, fetchedAt)), hasNextPage: params.page < page.totalPages };
});

/** The API may return only a preview for large lists; never call that complete. */
export const getSerializdList = Effect.fn('serializd.getList')(function* (
  deps: SerializdDeps,
  id: string,
) {
  if (serializdListUrl(id) == null) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'invalid list address' });
  const raw = yield* serializdHttp<unknown>(deps, `/list/${id}`, { auth: deps.session != null });
  const list = yield* Schema.decodeUnknownEffect(RawList)(raw).pipe(
    Effect.mapError(() => new ProviderDecodeError({ provider: 'serializd', detail: 'unrecognized list page' })),
  );
  const fetchedAt = DateTime.formatIso(yield* DateTime.now);
  return {
    ...normalizeList(list, fetchedAt),
    entries: list.listItems.map((entry) => normalizeEntry(entry, fetchedAt)),
    complete: list.listItems.length >= list.numberOfItems,
  };
});

const Editor = Schema.Struct({
  listName: Schema.String, listDescription: Schema.String,
  listItems: Schema.Array(Schema.Unknown), listCollaborators: Schema.Array(Schema.Unknown),
  isPrivate: Schema.Boolean, isRanked: Schema.Boolean, allowsComments: Schema.Boolean, bannerImagePath: Schema.NullOr(Schema.String),
});

/**
 * Saves through `/list/edit`, which replaces the whole list: every setting and
 * entry (with its note) comes from a fresh, complete read, overridden by `edit`.
 */
const saveSerializdEditor = Effect.fn('serializd.saveEditor')(function* (
  deps: SerializdDeps,
  listId: number,
  raw: unknown,
  edit: (editor: typeof Editor.Type) => Partial<Pick<typeof Editor.Type, 'listName' | 'listItems'>>,
) {
  const current = yield* Schema.decodeUnknownEffect(Editor)(raw).pipe(Effect.mapError(() => new ProviderDecodeError({ provider: 'serializd', detail: 'Serializd did not return the full editor settings. Open the list on Serializd.' })));
  const editor = { ...current, ...edit(current) };
  yield* serializdHttp(deps, '/list/edit', { method: 'POST', auth: true, body: {
    list_id: listId, list_name: editor.listName, list_description: editor.listDescription,
    list_items: editor.listItems, list_collaborators: editor.listCollaborators, is_private: editor.isPrivate,
    is_ranked: editor.isRanked, allows_comments: editor.allowsComments, banner_image_path: editor.bannerImagePath,
  } });
});

/** Renames through the full editor, so it refuses a list Serializd returned only part of. */
export const renameSerializdList = Effect.fn('serializd.renameList')(function* (
  deps: SerializdDeps,
  params: { id: string; username: string; name: string },
) {
  if (!deps.session || deps.session.username.toLowerCase() !== params.username.toLowerCase()) return yield* new ProviderAuthError({ provider: 'serializd', refreshFailed: true });
  const name = params.name.trim();
  if (serializdListUrl(params.id) == null || name === '') return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Give the list a name.' });
  const raw = yield* serializdHttp<unknown>(deps, `/list/${params.id}`, { auth: true });
  const list = yield* Schema.decodeUnknownEffect(RawList)(raw).pipe(Effect.mapError(() => new ProviderDecodeError({ provider: 'serializd', detail: 'Could not read the list before editing.' })));
  if (String(list.listId) !== params.id || list.owner.username.toLowerCase() !== params.username.toLowerCase()) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'You can only edit your own lists.' });
  if (list.listItems.length !== list.numberOfItems) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Serializd returned only part of this list. Rename it on Serializd to keep the other entries safe.' });
  yield* saveSerializdEditor(deps, list.listId, raw, () => ({ listName: name }));
  const confirmed = yield* getSerializdList(deps, params.id);
  if (confirmed.title !== name || !confirmed.complete) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Could not confirm the new name. Open Serializd before retrying.' });
  return confirmed;
});

/** Serializd's editor refuses more entries than this. */
export const MAX_SERIALIZD_LIST_ITEMS = 500;

export interface SerializdListDraft {
  name: string;
  description: string;
  isPrivate: boolean;
  isRanked: boolean;
  allowsComments: boolean;
  items: readonly NormalizedMediaItem[];
}

/** Mirrors the web editor's rules: a name, 1–500 shows, and its defaults for the rest. */
export const createSerializdList = Effect.fn('serializd.createList')(function* (
  deps: SerializdDeps,
  params: SerializdListDraft & { username: string },
) {
  if (!deps.session || deps.session.username.toLowerCase() !== params.username.toLowerCase()) return yield* new ProviderAuthError({ provider: 'serializd', refreshFailed: true });
  const name = params.name.trim();
  if (name === '') return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Give the list a name.' });
  if (params.items.length === 0 || params.items.length > MAX_SERIALIZD_LIST_ITEMS) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Serializd lists need between 1 and 500 shows.' });
  const showIds = params.items.map((item) => item.type === 'TV' ? item.externalIds.tmdb : undefined);
  if (!showIds.every((id) => Schema.is(Id)(id))) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Only shows can be added to a Serializd list.' });
  const raw = yield* serializdHttp<unknown>(deps, '/list/create', { method: 'POST', auth: true, body: {
    list_name: name, list_description: params.description.trim(),
    list_items: showIds.map((show_id, position) => ({ show_id, season_id: null, position, description: '' })),
    list_collaborators: [], is_private: params.isPrivate, is_ranked: params.isRanked,
    allows_comments: params.allowsComments, banner_image_path: '',
  } });
  const receipt = yield* Schema.decodeUnknownEffect(Schema.Struct({ listId: Id }))(raw).pipe(
    Effect.mapError(() => new ProviderDecodeError({ provider: 'serializd', detail: 'Serializd did not confirm the new list. Check your lists before retrying.' })),
  );
  const created = yield* getSerializdList(deps, String(receipt.listId));
  if (created.owner.toLowerCase() !== params.username.toLowerCase()) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Serializd returned a different list. Check your lists before retrying.' });
  return created;
});

/** A removal uses Serializd's full editor, so no settings or unseen entries may be dropped. */
export const setSerializdListMembership = Effect.fn('serializd.setListMembership')(function* (
  deps: SerializdDeps,
  params: { id: string; username: string; item: NormalizedMediaItem; present: boolean; entryId?: string },
) {
  if (!deps.session || deps.session.username.toLowerCase() !== params.username.toLowerCase()) return yield* new ProviderAuthError({ provider: 'serializd', refreshFailed: true });
  if (serializdListUrl(params.id) == null || params.item.type !== 'TV' || !Schema.is(Id)(params.item.externalIds.tmdb)) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Choose a show to edit this list.' });
  const raw = yield* serializdHttp<unknown>(deps, `/list/${params.id}`, { auth: true });
  const list = yield* Schema.decodeUnknownEffect(RawList)(raw).pipe(Effect.mapError(() => new ProviderDecodeError({ provider: 'serializd', detail: 'Could not read the list before editing.' })));
  if (String(list.listId) !== params.id || list.owner.username.toLowerCase() !== params.username.toLowerCase()) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'You can only edit your own lists.' });
  const entries = list.listItems.map((entry) => normalizeEntry(entry, ''));
  const entryId = params.entryId ?? `${params.item.externalIds.tmdb}//`;
  const index = entries.findIndex((entry) => entry.id === entryId);
  if (params.present) {
    if (index < 0 && list.listItems.length !== list.numberOfItems) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Could not check membership in the incomplete list. Add this show on Serializd to avoid a duplicate.' });
    if (index < 0) yield* serializdHttp(deps, '/list/add_item', { method: 'POST', auth: true, body: { list_id: list.listId, show_id: params.item.externalIds.tmdb } });
  } else if (index >= 0) {
    if (list.listItems.length !== list.numberOfItems) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Serializd returned only part of this list. Remove this item on Serializd to keep the other entries safe.' });
    yield* saveSerializdEditor(deps, list.listId, raw, (editor) => ({ listItems: editor.listItems.filter((_, position) => position !== index) }));
  } else if (list.listItems.length < list.numberOfItems) {
    return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Could not locate this entry in the incomplete list. Open Serializd before retrying.' });
  }
  const confirmed = yield* getSerializdList(deps, params.id);
  const present = confirmed.entries.some((entry) => entry.id === entryId);
  if (present !== params.present || (!params.present && !confirmed.complete)) return yield* new ProviderDecodeError({ provider: 'serializd', detail: 'Could not confirm the change. Open Serializd before retrying.' });
  return confirmed;
});
