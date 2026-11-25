import { Provider } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { ReleaseUpNextInput, UpNextRelease } from './types';

/** Letterboxd's scraped watchlist has no dates (2 TMDB calls/film); cap bounds bursts on large watchlists. */
const LETTERBOXD_RESOLVE_CAP = 30;

const RESOLVE_CONCURRENCY = 4;

const RENDERED_KINDS: ReadonlyArray<UpNextRelease['kind']> = [
  'theatrical',
  'digital',
];

/** Keeps yearless films (Letterboxd omits year on announced-but-unscheduled titles) and filters against local year. */
export function selectReleaseCandidates(
  films: readonly NormalizedMediaItem[],
  now: Date,
): NormalizedMediaItem[] {
  const currentYear = now.getFullYear();
  return films
    .filter((film) => film.year == null || film.year >= currentYear)
    .slice(0, LETTERBOXD_RESOLVE_CAP);
}

export type ResolveWatchlistFilm = (
  film: NormalizedMediaItem,
) => Promise<NormalizedMediaItem | null>;

export async function letterboxdReleaseInputs(
  films: readonly NormalizedMediaItem[],
  now: Date,
  resolve: ResolveWatchlistFilm,
): Promise<ReleaseUpNextInput[]> {
  const candidates = selectReleaseCandidates(films, now);
  const resolved = await mapBounded(candidates, RESOLVE_CONCURRENCY, (film) =>
    resolve(film).catch(() => null),
  );
  return resolved.flatMap((film) => (film == null ? [] : releaseInputs(film)));
}

function releaseInputs(film: NormalizedMediaItem): ReleaseUpNextInput[] {
  const calendar = film.releaseCalendar;
  if (calendar == null) return [];
  return RENDERED_KINDS.flatMap((kind) => {
    const date = calendar[kind];
    return date == null
      ? []
      : [{ item: film, kind, date, source: Provider.Letterboxd }];
  });
}

async function mapBounded<In, Out>(
  items: readonly In[],
  limit: number,
  run: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const results = new Map<number, Out>();
  let cursor = 0;
  const worker = async () => {
    for (let index = cursor++; index < items.length; index = cursor++) {
      results.set(index, await run(items[index] as In));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return items.map((_, index) => results.get(index) as Out);
}
