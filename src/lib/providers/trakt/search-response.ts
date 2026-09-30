import { Effect, Schema } from 'effect';

import { ProviderDecodeError } from '@/lib/providers/errors';

const optionalNumber = Schema.optionalWith(Schema.Number, { nullable: true });
const optionalString = Schema.optionalWith(Schema.String, { nullable: true });
const mediaFields = {
  title: Schema.String,
  ids: Schema.Struct({
    trakt: optionalNumber,
    tmdb: optionalNumber,
    tvdb: optionalNumber,
    imdb: optionalString,
    slug: optionalString,
  }),
  year: optionalNumber,
  overview: optionalString,
  runtime: optionalNumber,
  rating: optionalNumber,
  genres: Schema.optionalWith(Schema.mutable(Schema.Array(Schema.String)), { nullable: true }),
  images: Schema.optionalWith(Schema.Struct({
    poster: Schema.optionalWith(Schema.mutable(Schema.Array(Schema.String)), { nullable: true }),
    fanart: Schema.optionalWith(Schema.mutable(Schema.Array(Schema.String)), { nullable: true }),
  }), { nullable: true }),
};

const searchResponse = Schema.Array(Schema.Union(
  Schema.Struct({
    type: Schema.Literal('movie'),
    movie: Schema.Struct({ ...mediaFields, released: optionalString }),
  }),
  Schema.Struct({
    type: Schema.Literal('show'),
    show: Schema.Struct({ ...mediaFields, aired_episodes: optionalNumber }),
  }),
  Schema.Struct({
    type: Schema.String.pipe(Schema.filter((type) => type !== 'movie' && type !== 'show')),
  }),
));

/** Both Trakt search endpoints share this shape; unsupported result types are ignored. */
export function decodeSearchResponse(input: unknown) {
  return Schema.decodeUnknown(searchResponse)(input).pipe(
    Effect.mapError((error) => new ProviderDecodeError({
      provider: 'trakt',
      detail: `invalid search response: ${error.message}`,
    })),
  );
}
