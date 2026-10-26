import { Effect, Predicate, Schema } from 'effect';

import type { HttpFetch } from '@/lib/http/types';
import {
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import type { NormalizedRating } from '@/types/media';

const SPARQL_URL = 'https://query.wikidata.org/sparql';

// Wikidata's user-agent policy; browsers can't set `User-Agent`, so the header
// it reads in its place rides on every platform (docs/solutions/web-cors-wikidata.md).
const API_USER_AGENT = 'Shinobu (https://github.com/glpecile/shinobu)';

const ROTTEN_TOMATOES = 'Q105584';
const METACRITIC = 'Q150248';
// `P459` determination methods. Rotten Tomatoes also records a /10 average.
const TOMATOMETER = 'Q108403393';
const METASCORE = 'Q106515043';

/** The ids a title is looked up by: TMDB, or MAL and AniList for anime. TMDB wins when both are set. */
export interface WikidataLookup {
  tmdb?: { kind: 'movie' | 'tv'; id: number };
  mal?: number;
  anilist?: number;
}

/** `VALUES` rows for the lookup, or null when there's nothing to look up by. */
function lookupValues(lookup: WikidataLookup): string | null {
  const rows = lookup.tmdb != null
    ? [`(wdt:${lookup.tmdb.kind === 'movie' ? 'P4947' : 'P4983'} "${lookup.tmdb.id}")`]
    : [
      ...(lookup.mal != null ? [`(wdt:P4086 "${lookup.mal}")`] : []),
      ...(lookup.anilist != null ? [`(wdt:P8729 "${lookup.anilist}")`] : []),
    ];
  return rows.length > 0 ? rows.join(' ') : null;
}

const query = (values: string) => `SELECT ?score ?source ?method ?date ?rt ?mc WHERE {
  VALUES (?prop ?id) { ${values} }
  ?item ?prop ?id .
  OPTIONAL { ?item wdt:P1258 ?rt }
  OPTIONAL { ?item wdt:P1712 ?mc }
  OPTIONAL {
    VALUES ?source { wd:${ROTTEN_TOMATOES} wd:${METACRITIC} }
    ?item p:P444 ?statement .
    ?statement ps:P444 ?score ; pq:P447 ?source .
    OPTIONAL { ?statement pq:P459 ?method }
    OPTIONAL { ?statement pq:P585 ?date }
  }
}`;

const Value = Schema.optional(Schema.Struct({ value: Schema.String }));

const SparqlResults = Schema.Struct({
  results: Schema.Struct({
    bindings: Schema.Array(Schema.Struct({
      score: Value,
      source: Value,
      method: Value,
      date: Value,
      rt: Value,
      mc: Value,
    })),
  }),
});

type Binding = (typeof SparqlResults.Type)['results']['bindings'][number];

const entity = (uri: string | undefined) => uri?.slice(uri.lastIndexOf('/') + 1);

/** The Tomatometer % or the Metascore /100 a statement records, or null for any other kind of score. */
function scoreOf(binding: Binding): Pick<NormalizedRating, 'source' | 'value' | 'scale'> | null {
  const method = entity(binding.method?.value);
  const score = binding.score?.value ?? '';
  switch (entity(binding.source?.value)) {
    case ROTTEN_TOMATOES: {
      const percent = /^(\d{1,3})%$/.exec(score)?.[1];
      return percent != null && (method == null || method === TOMATOMETER)
        ? { source: 'rottenTomatoes', value: Number(percent), scale: '%' }
        : null;
    }
    case METACRITIC: {
      const metascore = /^(\d{1,3})\/100$/.exec(score)?.[1];
      return metascore != null && (method == null || method === METASCORE)
        ? { source: 'metacritic', value: Number(metascore), scale: 100 }
        : null;
    }
    default:
      return null;
  }
}

/** The newest Tomatometer and Metascore, each with its "as of" date and the page id it links to. */
function normalize(bindings: readonly Binding[]): NormalizedRating[] {
  const newest = new Map<NormalizedRating['source'], NormalizedRating>();
  for (const binding of bindings) {
    const score = scoreOf(binding);
    if (score == null) continue;
    const asOf = binding.date?.value.slice(0, 10);
    const current = newest.get(score.source);
    if (current != null && (asOf == null || (current.asOf != null && current.asOf >= asOf))) continue;
    const pageId = score.source === 'rottenTomatoes' ? binding.rt?.value : binding.mc?.value;
    newest.set(score.source, {
      ...score,
      ...(asOf != null ? { asOf } : {}),
      ...(pageId != null ? { pageId } : {}),
    });
  }
  return [newest.get('rottenTomatoes'), newest.get('metacritic')].filter(Predicate.isNotUndefined);
}

/**
 * Rotten Tomatoes and Metacritic scores as Wikidata's volunteers recorded them
 * (`P444`, by `P447` source, dated by `P585`). One keyless SPARQL query; a
 * title Wikidata doesn't know, or knows without scores, is an empty list.
 */
export const getWikidataRatings = Effect.fnUntraced(function* (
  deps: { fetch: HttpFetch },
  lookup: WikidataLookup,
): Effect.fn.Return<NormalizedRating[], ProviderError> {
  const values = lookupValues(lookup);
  if (values == null) return [];
  const response = yield* Effect.tryPromise({
    try: (signal) => deps.fetch(`${SPARQL_URL}?${new URLSearchParams({ query: query(values) }).toString()}`, {
      signal,
      headers: { Accept: 'application/sparql-results+json', 'Api-User-Agent': API_USER_AGENT },
    }),
    catch: (cause) => new ProviderNetworkError({ provider: 'wikidata', cause }),
  });
  if (response.status === 429) return yield* new ProviderRateLimitError({ provider: 'wikidata' });
  if (!response.ok) {
    return yield* new ProviderNetworkError({ provider: 'wikidata', status: response.status, cause: new Error('SPARQL query failed') });
  }
  const body = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: () => new ProviderDecodeError({ provider: 'wikidata', detail: 'unreadable SPARQL response' }),
  });
  const results = yield* Schema.decodeUnknownEffect(SparqlResults)(body).pipe(
    Effect.mapError(() => new ProviderDecodeError({ provider: 'wikidata', detail: 'unexpected SPARQL response' })),
  );
  return normalize(results.results.bindings);
});
