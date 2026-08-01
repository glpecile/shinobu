import { PROVIDERS } from '@/lib/providers/registry';
import { animeEffectiveMovieTvType } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { WatchlistEntry, WatchlistInput } from './types';

/**
 * The cross-provider watchlist merge (plan 0031 R27/KTD-11). **Pure**: no
 * React, no Effect, no query client — the gatherer hands it raw inputs and it
 * hands back rows, so every rule below is unit-testable against fixtures.
 *
 * Dedupe here **merges** rather than suppresses, which is the deliberate
 * difference from Up Next's `dedupeByTmdb`. Up Next drops the Trakt twin of an
 * AniList entry because only one card can be quick-logged; here both providers
 * are equally true statements about the same film, the user wants to see it is
 * on both, and — decisively — the removal verb has to know *which* providers
 * actually hold the item before it fires a write (R35).
 */

/** Routing order (the registry's own order), so `sources` never depends on gather order. */
const PROVIDER_ORDER = Object.keys(PROVIDERS) as ProviderId[];

/**
 * Which provider's copy of a merged item wins. AniList first because it holds
 * the user's anime state and airing schedule (the same rationale
 * `dedupeByTmdb` uses), then Simkl (plan 0034 KTD-10/R10 — the calendar/
 * yourShows precedence carries over here rather than inventing a second
 * ranking for the same two providers), then Trakt, with Letterboxd
 * contributing only when nothing else matched — its scrape carries a slug, a
 * title and a year and nothing more.
 */
const ITEM_PRECEDENCE: Record<ProviderId, number> = {
  anilist: 0,
  simkl: 1,
  trakt: 2,
  serializd: 3,
  letterboxd: 4,
};

/**
 * A film-shaped or series-shaped id space. Pairing the TMDB id with this
 * (rather than keying on the bare number) is the same discipline
 * `dedupeReleases` uses: TMDB numbers movies and series independently, so
 * movie 1399 and series 1399 are different works and must never merge.
 */
function movieTvKind(item: NormalizedMediaItem): 'MOVIE' | 'TV' {
  if (item.type === 'ANIME') return animeEffectiveMovieTvType(item);
  return item.type === 'MOVIE' ? 'MOVIE' : 'TV';
}

function isFilmLike(item: NormalizedMediaItem): boolean {
  return item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
}

/** Case- and punctuation-insensitive, never fuzzy — see `titleKey`. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}

/**
 * The weak leg, kept honest. The Letterboxd scrape yields `{slug, title, year}`
 * and no TMDB id, so title+year is the only way its films can ever meet their
 * Trakt twins — but it is **exact year only and film-like only**, because a
 * ±1 window is how you merge a remake into its original. No TMDB resolve fan
 * is run to close the gap either
 * (docs/solutions/letterboxd-watchlist-release-resolve-cost.md): an
 * unmatchable duplicate **stands** rather than being guessed at, the same
 * best-effort degradation Up Next's dedupe already accepts.
 */
function titleKey(item: NormalizedMediaItem): string | null {
  if (!isFilmLike(item) || item.year == null) return null;
  return `title:${normalizeTitle(item.title)}|${item.year}`;
}

/**
 * Every key an item can be recognised by, in R27's precedence order. Exported
 * because `useIsWatchlisted` (U14) answers "is this the same film" with this
 * exact function — one derivation, not two that can drift.
 */
export function watchlistMergeKeys(item: NormalizedMediaItem): string[] {
  const keys: string[] = [];
  const { tmdb, imdb } = item.externalIds;
  if (tmdb != null) keys.push(`tmdb:${movieTvKind(item)}:${tmdb}`);
  if (imdb != null && imdb !== '') keys.push(`imdb:${imdb}`);
  const title = titleKey(item);
  if (title != null) keys.push(title);
  return keys;
}

interface MergedEntry {
  item: NormalizedMediaItem;
  precedence: number;
  sources: Set<ProviderId>;
  sourceIds: string[];
  addedAt?: string;
  anilistStatus?: 'CURRENT' | 'PLANNING';
}

function absorb(entry: MergedEntry, input: WatchlistInput): void {
  const precedence = ITEM_PRECEDENCE[input.source];
  if (precedence < entry.precedence) {
    entry.item = input.item;
    entry.precedence = precedence;
  }
  entry.sources.add(input.source);
  if (!entry.sourceIds.includes(input.item.id)) entry.sourceIds.push(input.item.id);
  // The *most recent* statement wins: the sort answers "what did I add lately",
  // and a provider that has held a film for a year says nothing newer than the
  // one it was added to this morning.
  if (input.addedAt != null && (entry.addedAt == null || input.addedAt > entry.addedAt)) {
    entry.addedAt = input.addedAt;
  }
  // Only AniList rows carry one, so a merged row can never hold two — no
  // precedence rule needed here, unlike `item`.
  if (input.anilistStatus != null) entry.anilistStatus = input.anilistStatus;
}

/** `addedAt` descending, undated last — stable, so ties keep gather order. */
function byAddedAtDesc(a: WatchlistEntry, b: WatchlistEntry): number {
  if (a.addedAt == null && b.addedAt == null) return 0;
  if (a.addedAt == null) return 1;
  if (b.addedAt == null) return -1;
  return b.addedAt.localeCompare(a.addedAt);
}

export function computeWatchlist(inputs: readonly WatchlistInput[]): WatchlistEntry[] {
  const merged: MergedEntry[] = [];
  const byKey = new Map<string, MergedEntry>();

  for (const input of inputs) {
    const keys = watchlistMergeKeys(input.item);
    // First key that already names an entry wins — the keys are generated in
    // R27's precedence order, so a TMDB match is preferred over an IMDb one and
    // an IMDb match over a title+year one.
    let entry: MergedEntry | undefined;
    for (const key of keys) {
      entry ??= byKey.get(key);
    }
    if (entry == null) {
      entry = {
        item: input.item,
        precedence: ITEM_PRECEDENCE[input.source],
        sources: new Set([input.source]),
        sourceIds: [input.item.id],
        ...(input.addedAt != null ? { addedAt: input.addedAt } : {}),
        ...(input.anilistStatus != null
          ? { anilistStatus: input.anilistStatus }
          : {}),
      };
      merged.push(entry);
    } else {
      absorb(entry, input);
    }
    // Every key this row knows now points at the entry — that is what lets a
    // Trakt row carrying tmdb + imdb + title|year meet a Letterboxd row that
    // only ever knows the last of the three.
    for (const key of keys) {
      if (!byKey.has(key)) byKey.set(key, entry);
    }
  }

  return merged
    .map((entry) => ({
      id: entry.item.id,
      item: entry.item,
      sources: PROVIDER_ORDER.filter((id) => entry.sources.has(id)),
      sourceIds: entry.sourceIds,
      ...(entry.addedAt != null ? { addedAt: entry.addedAt } : {}),
      ...(entry.anilistStatus != null
        ? { anilistStatus: entry.anilistStatus }
        : {}),
    }))
    .sort(byAddedAtDesc);
}
