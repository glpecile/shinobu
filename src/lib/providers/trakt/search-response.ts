import { Effect, Schema } from 'effect';

import { ProviderDecodeError } from '@/lib/providers/errors';
import { optionalNullable } from '@/lib/providers/schema';

const optionalNumber = optionalNullable(Schema.Number);
const optionalString = optionalNullable(Schema.String);
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
  genres: optionalNullable(Schema.mutable(Schema.Array(Schema.String))),
  images: optionalNullable(Schema.Struct({
    poster: optionalNullable(Schema.mutable(Schema.Array(Schema.String))),
    fanart: optionalNullable(Schema.mutable(Schema.Array(Schema.String))),
  })),
};

const searchResponse = Schema.Array(Schema.Union([
  Schema.Struct({
    type: Schema.Literal('movie'),
    movie: Schema.Struct({ ...mediaFields, released: optionalString }),
  }),
  Schema.Struct({
    type: Schema.Literal('show'),
    show: Schema.Struct({ ...mediaFields, aired_episodes: optionalNumber }),
  }),
  Schema.Struct({
    type: Schema.String.check(Schema.makeFilter((type) => type !== 'movie' && type !== 'show')),
  }),
]));

/** Both Trakt search endpoints share this shape; unsupported result types are ignored. */
export function decodeSearchResponse(input: unknown) {
  return Schema.decodeUnknownEffect(searchResponse)(input).pipe(
    Effect.mapError((error) => new ProviderDecodeError({
      provider: 'trakt',
      detail: `invalid search response: ${error.message}`,
    })),
  );
}
