import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { ProviderDecodeError } from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import type { SerializdDeps } from './deps';
import { validateAuthToken } from './auth';
import { serializdHttp } from './http';

const Id = Schema.Int.check(Schema.isGreaterThan(0));
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const RawEpisode = Schema.Struct({
  showId: Id,
  showName: Schema.String,
  seasonNumber: Count,
  episodeNumber: Count,
  episodeName: Schema.optional(Schema.NullOr(Schema.String)),
  // Bare `YYYY-MM-DD`; compared through `lib/time`, never `new Date`.
  airDate: Schema.String,
  bannerImage: Schema.optional(Schema.NullOr(Schema.String)),
  stillPath: Schema.optional(Schema.NullOr(Schema.String)),
  runtime: Schema.optional(Schema.NullOr(Count)),
  isPremiere: Schema.optional(Schema.Boolean),
  isFinale: Schema.optional(Schema.Boolean),
  season: Schema.optional(Schema.NullOr(Schema.Struct({ posterPath: Schema.optional(Schema.NullOr(Schema.String)) }))),
  backdrops: Schema.optional(Schema.Array(Schema.Struct({ file_path: Schema.String }))),
});
const RawPage = Schema.Struct({ items: Schema.Array(RawEpisode) });

export interface SerializdUpcomingEpisode {
  item: NormalizedMediaItem;
  season: number;
  number: number;
  title?: string;
  airDate: string;
  runtime?: number;
  still?: string;
  isPremiere: boolean;
  isFinale: boolean;
}

const tmdbImage = (size: string, path: string | null | undefined) => (path ? `https://image.tmdb.org/t/p/${size}${path}` : '');

/**
 * The next airing episode of each show the account follows, soonest first —
 * Serializd's own "Coming soon" (`GET /search/upcoming_episodes_v3`). Signed
 * out the route answers 200 with an editorial set instead, so the read demands
 * a session rather than silently showing someone else's shows.
 * First page only: the row is a browse slice, and `nextCursor` is ignored.
 */
export const getSerializdUpcoming = Effect.fn('serializd.getUpcoming')(function* (deps: SerializdDeps) {
  // This endpoint returns editorial shows with 200 even for a revoked bearer.
  yield* validateAuthToken(deps, deps.session?.accessToken ?? '');
  const raw = yield* serializdHttp<unknown>(deps, '/search/upcoming_episodes_v3', { auth: true });
  const page = yield* Schema.decodeUnknownEffect(RawPage)(raw).pipe(
    Effect.mapError(() => new ProviderDecodeError({ provider: 'serializd', detail: 'unrecognized upcoming episodes' })),
  );
  const fetchedAt = new Date().toISOString();
  return page.items.map((entry): SerializdUpcomingEpisode => ({
    item: {
      id: `tmdb-tv-${entry.showId}`,
      title: entry.showName,
      coverImage: tmdbImage('w342', entry.season?.posterPath || entry.bannerImage),
      backdropImage: tmdbImage('w780', entry.backdrops?.[0]?.file_path),
      type: 'TV',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: fetchedAt,
      externalIds: { tmdb: entry.showId },
    },
    season: entry.seasonNumber,
    number: entry.episodeNumber,
    // TMDB's placeholder name ("Episode 3") only repeats the episode code.
    ...(entry.episodeName && entry.episodeName !== `Episode ${entry.episodeNumber}` ? { title: entry.episodeName } : {}),
    airDate: entry.airDate,
    ...(entry.runtime ? { runtime: entry.runtime } : {}),
    ...(entry.stillPath ? { still: tmdbImage('w780', entry.stillPath) } : {}),
    isPremiere: entry.isPremiere === true,
    isFinale: entry.isFinale === true,
  }));
});
