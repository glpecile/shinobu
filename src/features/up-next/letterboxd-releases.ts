import type { NormalizedMediaItem } from '@/types/media';

import type { ReleaseUpNextInput, UpNextRelease } from './types';

/**
 * Calendar's Letterboxd half (plan 0030 U6/KTD-5). Every other release source
 * arrives pre-dated: Trakt's my-calendars already know when a watchlisted film
 * comes out. Letterboxd's watchlist is a *scrape* — slug, title, year, and
 * nothing else (`letterboxd/watchlist.ts`) — so learning one film's dates costs
 * a TMDB title search *plus* a catalogue read. Two calls per film, against a
 * watchlist that is routinely 600+ films deep, to find the typically-zero films
 * releasing in the next 7 days.
 *
 * This module is the bound on that fan, and it is deliberately the *pure* half:
 * the filter, the cap and the concurrency limit are testable here without a
 * QueryClient, an Effect or a network, and the two-call resolve is injected
 * (`state/queries/letterboxd.ts` wires the real one).
 */

/**
 * Ceiling on resolves per gather. Measured against real public watchlists
 * (2026-07-27): the post-filter candidate count on the watchlist's **first
 * page** — the 28 films the "Your Watchlist" feed row already loads, so the
 * scrape itself costs nothing extra — ran 0–22 across seven accounts, so this
 * cap is slack in practice. It is here as the standing guard: it is what stops
 * a later, wider watchlist source from silently becoming an 800-call fan.
 */
export const LETTERBOXD_RESOLVE_CAP = 30;

/**
 * How many resolves are in flight at once. Bounded for the same reason the
 * pooled Trakt progress fan is (`state/queries/up-next.ts`): 60 requests fired
 * in one instant is exactly the shape rate limiters punish, and none of them is
 * on a critical path — Calendar renders without this source.
 */
const RESOLVE_CONCURRENCY = 4;

/** Kinds a v1 agenda row renders — physical flows but is not surfaced (R3). */
const RENDERED_KINDS: ReadonlyArray<UpNextRelease['kind']> = [
  'theatrical',
  'digital',
];

/**
 * The films worth spending a resolve on. A release inside the today…today+6
 * window is by definition dated this year or later, so a film Letterboxd
 * already stamps with an older year cannot contribute and is dropped *before*
 * any request — that is what turns a 600-film watchlist into a couple of dozen
 * candidates. A **yearless** film is kept, not dropped: Letterboxd omits the
 * year exactly on the announced-but-unscheduled titles this feature exists for.
 *
 * `now.getFullYear()` is the local year on purpose, matching every other day
 * judgment in Up Next — an item is filtered against the user's calendar, not
 * UTC's.
 */
export function selectReleaseCandidates(
  films: readonly NormalizedMediaItem[],
  now: Date,
  cap: number = LETTERBOXD_RESOLVE_CAP,
): NormalizedMediaItem[] {
  const currentYear = now.getFullYear();
  return films
    .filter((film) => film.year == null || film.year >= currentYear)
    .slice(0, Math.max(0, cap));
}

/**
 * Learns one candidate's release dates, returning the film enriched with them
 * (and with the TMDB id the resolve discovered — the dedupe key that collapses
 * a film watchlisted on both Trakt and Letterboxd, KTD-6). `null` means the
 * resolve found nothing it was confident about; a *rejection* is treated the
 * same way, so a failed film costs an entry, never the section (R7).
 */
export type ResolveWatchlistFilm = (
  film: NormalizedMediaItem,
) => Promise<NormalizedMediaItem | null>;

/**
 * The Letterboxd watchlist as dated release inputs: filter, cap, resolve, shape.
 * Order follows the watchlist (most recently added first), which only decides
 * *which* films the cap keeps — Calendar sorts by instant regardless.
 */
export async function letterboxdReleaseInputs(
  films: readonly NormalizedMediaItem[],
  now: Date,
  resolve: ResolveWatchlistFilm,
  cap: number = LETTERBOXD_RESOLVE_CAP,
): Promise<ReleaseUpNextInput[]> {
  const candidates = selectReleaseCandidates(films, now, cap);
  const resolved = await mapBounded(candidates, RESOLVE_CONCURRENCY, (film) =>
    resolve(film).catch(() => null),
  );
  return resolved.flatMap((film) => (film == null ? [] : releaseInputs(film)));
}

/**
 * One resolved film → one input per dated release kind (R3): a film in cinemas
 * Friday and streaming in March is two rows with two dates, never one row that
 * moves. A film whose catalogue carries no dates at all yields nothing.
 */
function releaseInputs(film: NormalizedMediaItem): ReleaseUpNextInput[] {
  const calendar = film.releaseCalendar;
  if (calendar == null) return [];
  return RENDERED_KINDS.flatMap((kind) => {
    const date = calendar[kind];
    return date == null
      ? []
      : [{ item: film, kind, date, source: 'letterboxd' as const }];
  });
}

/** `Promise.all` with a worker limit, results back in input order. */
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
