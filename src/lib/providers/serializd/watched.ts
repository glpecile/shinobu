import { Effect, Schema } from 'effect';

import { ProviderAuthError, ProviderDecodeError } from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';

const Username = Schema.String.check(Schema.isPattern(/^(?!.*\.\.)[A-Za-z0-9_.-]{1,100}$/));
const Id = Schema.Int.check(Schema.isGreaterThan(0));
const WatchedPage = Schema.Struct({
  items: Schema.Array(Schema.Struct({
    showId: Id,
    showName: Schema.String,
    seasonIds: Schema.Array(Id),
    dateAdded: Schema.String,
    bannerImage: Schema.optional(Schema.NullOr(Schema.String)),
  })),
  totalPages: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9999 })),
});

/** One shared snapshot: Serializd retired per-show progress, so membership needs every page. */
export const getSerializdWatchedShows = Effect.fn('serializd.getWatchedShows')(function* (deps: SerializdDeps) {
  const username = deps.session?.username;
  if (!Schema.is(Username)(username)) return yield* new ProviderAuthError({ provider: 'serializd', refreshFailed: true });
  const items: NormalizedMediaItem[] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const raw = yield* serializdHttp<unknown>(deps, `/user/${encodeURIComponent(username)}/watchedpage_v2/${page}?sort_by=date_added_desc`, { auth: true });
    const result = yield* Schema.decodeUnknownEffect(WatchedPage)(raw).pipe(
      Effect.mapError(() => new ProviderDecodeError({ provider: 'serializd', detail: 'unrecognized watched shows page' })),
    );
    totalPages = result.totalPages;
    for (const show of result.items) {
      if (show.seasonIds.length === 0) continue;
      items.push({
        id: `serializd-${show.showId}`,
        title: show.showName,
        coverImage: show.bannerImage ? `https://image.tmdb.org/t/p/w342${show.bannerImage}` : '',
        type: 'TV',
        // The snapshot records seasons, not an episode count.
        currentProgress: 0,
        progressUnit: 'episode',
        lastUpdated: show.dateAdded,
        externalIds: { tmdb: show.showId },
      });
    }
  }
  return items;
});
