import { PROVIDERS } from '@/lib/providers/registry';
import { mediaSortValue } from '@/lib/media-sort';
import { animeEffectiveMovieTvType } from '@/lib/providers/routing';
import { bridgeBooks } from '@/lib/providers/reading-bridge';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { WatchlistEntry, WatchlistInput } from './types';

const PROVIDER_ORDER = Object.keys(PROVIDERS) as ProviderId[];

const ITEM_PRECEDENCE: Record<ProviderId, number> = {
  anilist: 0,
  simkl: 1,
  trakt: 2,
  serializd: 3,
  letterboxd: 4,
  hardcover: -1,
};

// TMDB numbers movies and TV series independently, so the ID must be paired with kind.
function movieTvKind(item: NormalizedMediaItem): 'MOVIE' | 'TV' {
  if (item.type === 'ANIME') return animeEffectiveMovieTvType(item);
  return item.type === 'MOVIE' ? 'MOVIE' : 'TV';
}

function isFilmLike(item: NormalizedMediaItem): boolean {
  return item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}

// Letterboxd scrapes yield only {slug, title, year} with no TMDB id; match exact year on films only without fan-out resolution (docs/solutions/letterboxd-watchlist-release-resolve-cost.md).
function titleKey(item: NormalizedMediaItem): string | null {
  if (!isFilmLike(item) || item.year == null) return null;
  return `title:${normalizeTitle(item.title)}|${item.year}`;
}

export function watchlistMergeKeys(item: NormalizedMediaItem): string[] {
  const keys: string[] = [];
  const { tmdb, imdb } = item.externalIds;
  if (tmdb != null) keys.push(`tmdb:${movieTvKind(item)}:${tmdb}`);
  if (imdb != null && imdb !== '') keys.push(`imdb:${imdb}`);
  const title = titleKey(item);
  if (title != null) keys.push(title);
  return keys;
}

function readingWorkKey(item: NormalizedMediaItem): string | null {
  let id: number | undefined;
  switch (item.type) {
    case 'BOOK':
      id = item.bridgedAniList?.id;
      break;
    case 'MANGA':
      id = item.externalIds.anilist;
      break;
    case 'ANIME':
    case 'MOVIE':
    case 'TV':
      break;
  }
  return id == null ? null : `anilist-manga:${id}`;
}

function bridgeReadingInputs(
  inputs: readonly WatchlistInput[],
  mangaList: readonly NormalizedMediaItem[],
): readonly WatchlistInput[] {
  const bridged = bridgeBooks(inputs.map((input) => input.item), mangaList);
  if (bridged.size === 0) return inputs;
  // Hardcover returns list rows in arbitrary order; pick the lowest id deterministically.
  const joined = new Map<number, string>();
  for (const [itemId, grouping] of bridged) {
    const held = joined.get(grouping.id);
    if (held == null || itemId < held) joined.set(grouping.id, itemId);
  }
  return inputs.map((input) => {
    const grouping = bridged.get(input.item.id);
    if (grouping == null || joined.get(grouping.id) !== input.item.id) return input;
    return { ...input, item: { ...input.item, bridgedAniList: grouping } };
  });
}

interface MergedEntry {
  item: NormalizedMediaItem;
  precedence: number;
  sources: Set<ProviderId>;
  sourceIds: string[];
  addedAt?: string;
  anilistStatus?: 'CURRENT' | 'PLANNING';
  simklWatchedCount?: number;
}

function absorb(entry: MergedEntry, input: WatchlistInput): void {
  const precedence = ITEM_PRECEDENCE[input.source];
  const previous = entry.item;
  if (precedence < entry.precedence) {
    entry.item = input.item;
    entry.precedence = precedence;
  }
  const fallback = entry.item === input.item ? previous : input.item;
  for (const field of ['year', 'runtime'] as const) {
    if (isFilmLike(entry.item) !== isFilmLike(fallback) ||
      (entry.item.type === 'MANGA') !== (fallback.type === 'MANGA')) continue;
    const value = mediaSortValue(fallback, field);
    if (mediaSortValue(entry.item, field) == null && value != null) {
      entry.item = { ...entry.item, [field]: value };
    }
  }
  entry.sources.add(input.source);
  if (!entry.sourceIds.includes(input.item.id)) entry.sourceIds.push(input.item.id);
  if (input.addedAt != null && (entry.addedAt == null || input.addedAt > entry.addedAt)) {
    entry.addedAt = input.addedAt;
  }
  if (input.anilistStatus != null) entry.anilistStatus = input.anilistStatus;
  if (input.simklWatchedCount != null) {
    entry.simklWatchedCount = input.simklWatchedCount;
  }
}

function byAddedAtDesc(a: WatchlistEntry, b: WatchlistEntry): number {
  if (a.addedAt == null && b.addedAt == null) return 0;
  if (a.addedAt == null) return 1;
  if (b.addedAt == null) return -1;
  return b.addedAt.localeCompare(a.addedAt);
}

export function computeWatchlist(
  inputs: readonly WatchlistInput[],
  mangaList: readonly NormalizedMediaItem[] = [],
): WatchlistEntry[] {
  const merged: MergedEntry[] = [];
  const byKey = new Map<string, MergedEntry>();

  for (const input of bridgeReadingInputs(inputs, mangaList)) {
    const work = readingWorkKey(input.item);
    const keys = work == null ? watchlistMergeKeys(input.item) : [...watchlistMergeKeys(input.item), work];
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
        ...(input.simklWatchedCount != null
          ? { simklWatchedCount: input.simklWatchedCount }
          : {}),
      };
      merged.push(entry);
    } else {
      absorb(entry, input);
    }
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
      ...(entry.simklWatchedCount != null
        ? { simklWatchedCount: entry.simklWatchedCount }
        : {}),
    }))
    .sort(byAddedAtDesc);
}
