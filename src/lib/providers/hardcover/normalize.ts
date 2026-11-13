import * as Schema from 'effect/Schema';

import { optionalNullable } from '@/lib/providers/schema';
import { Provider } from '@/lib/providers/types';
import { isDateOnly } from '@/lib/time/has-aired';
import type { NormalizedDiaryEntry, NormalizedMediaItem, ReadingEvent } from '@/types/media';

// Typesense sends ids as strings, and Hasura may stringify `numeric`.
export const numeric = Schema.Union([Schema.Number, Schema.FiniteFromString]);

/**
 * The book fields Shinobu reads. A `books` row and a Typesense search
 * document use the same names, so both decode with this.
 */
export const hardcoverBookFields = {
  id: numeric,
  title: optionalNullable(Schema.String),
  description: optionalNullable(Schema.String),
  pages: optionalNullable(numeric),
  release_year: optionalNullable(numeric),
  rating: optionalNullable(numeric),
  ratings_count: optionalNullable(numeric),
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

/**
 * A `timestamptz` as an ISO instant, or null. Hasura sends microseconds, and
 * the ECMAScript date format defines only milliseconds, so the rest is cut.
 */
function isoInstant(value: string | undefined): string | null {
  if (value == null) return null;
  const instant = new Date(value.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

const editionPages = optionalNullable(Schema.Struct({ pages: optionalNullable(Schema.Number) }));

/** One `user_books` row of the library read, with the read in progress nested. */
export const HardcoverLibraryRow = Schema.Struct({
  status_id: Schema.Number,
  created_at: Schema.String,
  updated_at: optionalNullable(Schema.String),
  edition: editionPages,
  book: HardcoverBook,
  user_book_reads: Schema.Array(Schema.Struct({
    progress_pages: optionalNullable(Schema.Number),
    progress_seconds: optionalNullable(Schema.Number),
    edition: editionPages,
  })),
});
export type HardcoverLibraryRow = typeof HardcoverLibraryRow.Type;

export interface HardcoverLibraryEntry {
  statusId: number;
  /** When the book entered the library. */
  addedAt: string;
  item: NormalizedMediaItem;
}

/**
 * One library row → the book with the reader's progress. Pages read come from
 * the read in progress, and the total from that read's edition, else the
 * entry's, else the book's. An audiobook read counts seconds, so it shows no
 * page progress and no page total.
 */
export function normalizeHardcoverLibraryRow(row: HardcoverLibraryRow): HardcoverLibraryEntry | null {
  const addedAt = isoInstant(row.created_at);
  if (addedAt == null) return null;
  const open = row.user_book_reads[0];
  const pagesRead = open?.progress_pages ?? 0;
  const audio = open?.progress_seconds != null && pagesRead <= 0;
  const pages = audio ? undefined : (open?.edition?.pages ?? row.edition?.pages ?? row.book.pages);
  const item = normalizeHardcoverBook({ ...row.book, pages }, isoInstant(row.updated_at) ?? addedAt);
  return { statusId: row.status_id, addedAt, item: { ...item, currentProgress: pagesRead } };
}

/** One `reading_journals` row of the diary read. */
export const HardcoverJournalRow = Schema.Struct({
  // A Hasura `bigint`, which can arrive as a string.
  id: Schema.Union([Schema.Number, Schema.String]),
  event: optionalNullable(Schema.String),
  action_at: Schema.String,
  journal_date: optionalNullable(Schema.String),
  book: optionalNullable(HardcoverBook),
});
export type HardcoverJournalRow = typeof HardcoverJournalRow.Type;

/** The journal events Hardcover writes for a read. */
const READING_EVENTS = new Map<string, ReadingEvent>([
  ['status_currently_reading', 'started'],
  ['progress_updated', 'progressed'],
  ['status_read', 'finished'],
]);

/** What the diary read filters `event` on. */
export const HARDCOVER_READING_EVENTS = [...READING_EVENTS.keys()];

/**
 * One journal entry → a diary entry. `journal_date` is the reader's own
 * calendar day, so it stays a bare date and no time zone can move it to the
 * day before or after. Without one, `action_at` is the instant the event
 * happened.
 */
export function normalizeHardcoverJournal(row: HardcoverJournalRow): NormalizedDiaryEntry | null {
  const readingEvent = row.event == null ? undefined : READING_EVENTS.get(row.event);
  const at = isoInstant(row.action_at);
  if (readingEvent == null || row.book == null || at == null) return null;
  const day = row.journal_date != null && isDateOnly(row.journal_date) ? row.journal_date : null;
  return {
    id: `hardcover-${row.id}`,
    provider: Provider.Hardcover,
    watchedAt: day ?? at,
    ...(day != null ? { dateOnly: true } : {}),
    item: normalizeHardcoverBook(row.book, at),
    readingEvent,
  };
}
