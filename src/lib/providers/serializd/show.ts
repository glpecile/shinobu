import * as Effect from 'effect/Effect';

import type { ProviderError } from '@/lib/providers/errors';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';

/** The watchlist joins season numbers to Serializd ids. Rows without either cannot be used. */
export interface RawShowResponse {
  seasons?: Array<{ id?: number; seasonNumber?: number; episodeCount?: number }>;
}

/** Read the show's season identities for the season-scoped watchlist writes. */
export function getSerializdShow(
  deps: SerializdDeps,
  params: { tmdbId: number },
): Effect.Effect<RawShowResponse, ProviderError> {
  return serializdHttp<RawShowResponse>(deps, `/show/${params.tmdbId}`);
}
