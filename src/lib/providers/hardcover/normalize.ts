import * as Schema from 'effect/Schema';

import { optionalNullable } from '@/lib/providers/schema';
import { Provider } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

// Typesense sends ids as strings, and Hasura may stringify `numeric`.
const numeric = Schema.Union([Schema.Number, Schema.FiniteFromString]);

/**
 * The book fields Shinobu reads. A `books` row and a Typesense search
 * document use the same names, so both decode with this.
 */
export const hardcoverBookFields = {
  id: numeric,
  title: optionalNullable(Schema.String),
  description: optionalNullable(Schema.String),
  pages: optionalNullable(Schema.Number),
  release_year: optionalNullable(Schema.Number),
  rating: optionalNullable(numeric),
  ratings_count: optionalNullable(Schema.Number),
  image: optionalNullable(Schema.Struct({ url: optionalNullable(Schema.String) })),
};

export const HardcoverBook = Schema.Struct(hardcoverBookFields);
export type HardcoverBook = typeof HardcoverBook.Type;

/** Inverse of the `hardcover-<id>` minting below: the book id behind an item id, or null. */
export function parseHardcoverItemId(id: string): number | null {
  const match = /^hardcover-([1-9][0-9]*)$/.exec(id);
  return match == null ? null : Number(match[1]);
}

/**
 * One Hardcover book → NormalizedMediaItem. The cover and page count are the
 * book's own, which Hardcover takes from its default cover and physical
 * editions. A book without pages (audio only) has no total.
 */
export function normalizeHardcoverBook(book: HardcoverBook, nowIso: string): NormalizedMediaItem {
  const cover = book.image?.url ?? '';
  const description = book.description?.trim() ?? '';
  return {
    id: `hardcover-${book.id}`,
    title: book.title ?? '',
    coverImage: cover,
    ...(description !== '' ? { overview: description } : {}),
    ...(book.release_year != null ? { year: book.release_year } : {}),
    ...(book.rating != null && book.rating > 0
      ? {
          ratings: [{
            source: Provider.Hardcover,
            value: book.rating,
            scale: 5,
            ...(book.ratings_count != null ? { votes: book.ratings_count } : {}),
          }],
        }
      : {}),
    type: 'BOOK',
    currentProgress: 0,
    progressUnit: 'page',
    ...(book.pages != null && book.pages > 0 ? { totalEpisodes: book.pages } : {}),
    lastUpdated: nowIso,
    externalIds: { hardcover: book.id },
  };
}
