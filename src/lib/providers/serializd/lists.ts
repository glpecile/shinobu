import { DateTime, Effect, Schema } from 'effect';

import { ProviderDecodeError } from '@/lib/providers/errors';
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
    previews: raw.listItems.slice(0, 3).map((entry) => normalizeEntry(entry, fetchedAt).item),
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
