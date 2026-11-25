import * as Schema from 'effect/Schema';

import { optionalNullable } from '@/lib/providers/schema';
import { Provider } from '@/lib/providers/types';
import { isDateOnly } from '@/lib/time/has-aired';
import type { NormalizedDiaryEntry, NormalizedMediaItem, ReadingEvent } from '@/types/media';

// Typesense sends ids as strings, and Hasura may stringify `numeric`.
export const numeric = Schema.Union([Schema.Number, Schema.FiniteFromString]);

export const hardcoverBookFields = {
  id: numeric,
  title: optionalNullable(Schema.String),
  description: optionalNullable(Schema.String),
  pages: optionalNullable(numeric),
  release_year: optionalNullable(numeric),
  rating: optionalNullable(numeric),
  ratings_count: optionalNullable(numeric),
  image: optionalNullable(Schema.Struct({ url: optionalNullable(Schema.String) })),
  contributions: optionalNullable(Schema.Array(Schema.Struct({
    author: optionalNullable(Schema.Struct({ name: optionalNullable(Schema.String) })),
  }))),
  featured_book_series: optionalNullable(Schema.Struct({
    series: optionalNullable(Schema.Struct({ name: optionalNullable(Schema.String) })),
  })),
};

export const HardcoverBook = Schema.Struct(hardcoverBookFields);
export type HardcoverBook = typeof HardcoverBook.Type;

export function parseHardcoverItemId(id: string): number | null {
  const match = /^hardcover-([1-9][0-9]*)$/.exec(id);
  return match == null ? null : Number(match[1]);
}

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
    ...(book.contributions != null
      ? {
          readingCredits: {
            people: book.contributions.flatMap((credit) => credit.author?.name ?? []),
            ...(book.featured_book_series?.series?.name != null ? { series: book.featured_book_series.series.name } : {}),
          },
        }
      : {}),
  };
}

/** Hasura sends microsecond `timestamptz` values; truncate to milliseconds for ECMAScript `Date`. */
function isoInstant(value: string | undefined): string | null {
  if (value == null) return null;
  const instant = new Date(value.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

const editionPages = optionalNullable(Schema.Struct({ pages: optionalNullable(Schema.Number) }));

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
  addedAt: string;
  item: NormalizedMediaItem;
}

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

export const HardcoverJournalRow = Schema.Struct({
  // A Hasura `bigint`, which can arrive as a string.
  id: Schema.Union([Schema.Number, Schema.String]),
  event: optionalNullable(Schema.String),
  action_at: Schema.String,
  journal_date: optionalNullable(Schema.String),
  book: optionalNullable(HardcoverBook),
  metadata: optionalNullable(Schema.Struct({
    progress: optionalNullable(numeric),
    progress_was: optionalNullable(numeric),
    progress_pages: optionalNullable(numeric),
    progress_pages_was: optionalNullable(numeric),
  })),
});
export type HardcoverJournalRow = typeof HardcoverJournalRow.Type;

const READING_EVENTS = new Map<string, ReadingEvent>([
  ['status_currently_reading', 'started'],
  ['progress_updated', 'progressed'],
  ['status_read', 'finished'],
]);

export const HARDCOVER_READING_EVENTS = [...READING_EVENTS.keys()];

function wholePercent(share: number): number {
  if (share <= 0) return 0;
  if (share >= 100) return 100;
  return Math.min(99, Math.max(1, Math.round(share)));
}

/** Keeps `journal_date` as a bare date so timezones never shift the reader's calendar day. */
export function normalizeHardcoverJournal(row: HardcoverJournalRow): NormalizedDiaryEntry | null {
  const readingEvent = row.event == null ? undefined : READING_EVENTS.get(row.event);
  const at = isoInstant(row.action_at);
  if (readingEvent == null || row.book == null || at == null) return null;
  const day = row.journal_date != null && isDateOnly(row.journal_date) ? row.journal_date : null;
  const progressed = readingEvent === 'progressed' ? row.metadata : undefined;
  const toPage = progressed?.progress_pages;
  const toPercent = progressed?.progress;
  return {
    id: `hardcover-${row.id}`,
    provider: Provider.Hardcover,
    watchedAt: day ?? at,
    ...(day != null ? { dateOnly: true } : {}),
    item: normalizeHardcoverBook(row.book, at),
    readingEvent,
    ...(toPage != null && toPage > 0
      ? { pages: { from: (progressed?.progress_pages_was ?? 0) + 1, to: toPage } }
      : {}),
    ...(toPercent != null && toPercent > 0
      ? { percent: { from: wholePercent(progressed?.progress_was ?? 0), to: wholePercent(toPercent) } }
      : {}),
  };
}
