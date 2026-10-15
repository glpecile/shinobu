import { Effect } from 'effect';

import type { ProviderError } from '@/lib/providers/errors';
import { titleKey } from '@/lib/providers/pick-movie-match';
import type { NormalizedMediaItem } from '@/types/media';
import type { TmdbDeps } from './deps';
import { searchTitles } from './reads';

/** Edit distance to a complete-word span, counting an adjacent swap as one edit. */
function wordSpanDistance(query: string, title: string): number {
  const a = Array.from(query);
  const words = title.split(' ');
  const b = Array.from(words.join(''));
  const boundaries = new Set([0]);
  let end = 0;
  for (const word of words) {
    end += Array.from(word).length;
    boundaries.add(end);
  }
  let previous = Array.from({ length: b.length + 1 }, (_, index) => boundaries.has(index) ? 0 : Infinity);
  let beforePrevious = previous;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
      }
    }
    beforePrevious = previous;
    previous = row;
  }
  return Math.min(...[...boundaries].map((index) => previous[index]));
}

function titleScore(query: string, item: NormalizedMediaItem): number {
  const queryLength = Array.from(query).length;
  return Math.max(...[item.title, ...Object.values(item.titles ?? {})].map((title) => {
    const normalized = titleKey(title);
    const key = normalized.replaceAll(' ', '');
    if (key === query) return 1;
    if (key.startsWith(query)) return 0.98;
    if (key.includes(query)) return 0.95;
    const distance = wordSpanDistance(query, normalized);
    const titleLength = Array.from(key).length;
    // At most two edits; shorter words cannot afford the same ambiguity.
    return distance <= Math.min(2, Math.max(1, Math.floor(queryLength / 5)))
      ? 0.9 - distance / queryLength - 0.05 * (1 - Math.min(queryLength, titleLength) / Math.max(queryLength, titleLength))
      : 0;
  }));
}

/**
 * Discovery suggestions only — never use fuzzy results to resolve an identity.
 * ponytail: first-page candidates only; widen retrieval if misses justify more
 * API traffic. Sparse responses get at most two word searches or one prefix.
 */
export const searchTitlesFuzzy = Effect.fnUntraced(function* (
  deps: TmdbDeps,
  params: { query: string },
): Effect.fn.Return<NormalizedMediaItem[], ProviderError> {
  const query = params.query.trim();
  const words = titleKey(query).split(' ').filter(Boolean);
  const key = words.join('');
  if (key === '') return [];
  const direct = yield* searchTitles(deps, { query });
  const characters = Array.from(key);
  if (characters.length < 4 || characters.length > 120) return direct;

  const ranked = new Map(direct.map((item) => [item.id, { item, score: titleScore(key, item) }]));
  if (direct.length < 5) {
    const fallbacks = words.length === 1
      // Keep roughly two thirds, but at least four code points to avoid overly broad prefixes.
      ? (characters.length >= 5 ? [characters.slice(0, Math.max(4, Math.ceil(characters.length * 0.65))).join('')] : [])
      : [...new Set(words)]
        .filter((word) => word.length >= 3)
        .sort((a, b) => b.length - a.length)
        .slice(0, 2);
    const supplements = yield* Effect.forEach(fallbacks, (word) =>
      searchTitles(deps, { query: word }).pipe(Effect.catch(() => Effect.succeed([]))),
    { concurrency: 2 });
    for (const item of supplements.flat()) {
      if (ranked.has(item.id)) continue;
      const score = titleScore(key, item);
      if (score > 0) ranked.set(item.id, { item, score });
    }
  }
  return [...ranked.values()].sort((a, b) => b.score - a.score).map(({ item }) => item);
});
