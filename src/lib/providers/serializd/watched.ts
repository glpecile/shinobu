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
    numSeasons: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  })),
  totalPages: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9999 })),
});

export interface SerializdWatchedShow {
  item: NormalizedMediaItem;
  watchedSeasons: number;
  totalSeasons?: number;
}

/** One shared snapshot: Serializd retired per-show progress, so membership needs every page. */
export const getSerializdWatchedShows = Effect.fn('serializd.getWatchedShows')(function* (deps: SerializdDeps) {
  const username = deps.session?.username;
  if (!Schema.is(Username)(username)) return yield* new ProviderAuthError({ provider: 'serializd', refreshFailed: true });
  const readPage = (page: number) =>
    serializdHttp<unknown>(deps, `/user/${encodeURIComponent(username)}/watchedpage_v2/${page}?sort_by=date_added_desc`, { auth: true }).pipe(
      Effect.flatMap((raw) => Schema.decodeUnknownEffect(WatchedPage)(raw).pipe(
        Effect.mapError(() => new ProviderDecodeError({ provider: 'serializd', detail: 'unrecognized watched shows page' })),
      )),
    );
  // Page 1 carries the page count; the rest load a few at a time instead of one by one.
  const first = yield* readPage(1);
  const rest = yield* Effect.forEach(
    Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => index + 2),
    readPage,
    { concurrency: 3 },
  );
  const items: SerializdWatchedShow[] = [];
  for (const result of [first, ...rest]) {
    for (const show of result.items) {
      if (show.seasonIds.length === 0) continue;
      items.push({
        watchedSeasons: new Set(show.seasonIds).size,
        totalSeasons: show.numSeasons,
        item: {
        id: `serializd-${show.showId}`,
        title: show.showName,
        coverImage: show.bannerImage ? `https://image.tmdb.org/t/p/w342${show.bannerImage}` : '',
        type: 'TV',
        // The snapshot records seasons, not an episode count.
        currentProgress: 0,
        progressUnit: 'episode',
        lastUpdated: show.dateAdded,
        externalIds: { tmdb: show.showId },
        },
      });
    }
  }
  return items;
});
