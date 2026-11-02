import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import type { LogMediaVariables } from './fan-out';

/** The trigger supplies intent; the app-level session owns the form and write. */
export type LogRequest = Pick<LogMediaVariables, 'item' | 'episodes' | 'entryEpisodes' | 'watchedAt' | 'tags' | 'liked'> & {
  title: string;
  description: string;
  entry?: UpNextEpisodeEntry;
  /** Season-wide selections stay batched even when only one episode has aired. */
  batch?: boolean;
  /**
   * A "Log chapter N" request whose form can run it through a later chapter
   * (plan 0117 M2). `from` is N, and `total` is AniList's chapter count, the
   * field's cap; an ongoing manga has none.
   */
  chapterRange?: { from: number; total?: number };
};

/**
 * Whether a request opens the episode catch-up chain rather than the one-shot
 * form. Manga takes the form: the chain's queue walks an airing schedule,
 * which manga chapters don't have.
 */
export function isEpisodeLog(request: LogRequest): boolean {
  const { item } = request;
  return !request.batch && item.type !== 'MOVIE' && item.type !== 'MANGA' && item.isFilm !== true &&
    (request.episodes?.length === 1 || request.entryEpisodes?.length === 1);
}

/**
 * The cap on the "through chapter" field when AniList has no total.
 * `entryEpisodes` lists every chapter of a range, so a stray keystroke can't
 * build a huge one. The longest-running manga have about 2,000 chapters.
 */
const LAST_CHAPTER = 9999;

/** What the "through chapter" field shows for typed `text`: its digits, clamped to the total or `LAST_CHAPTER`. */
export function throughChapterText(text: string, total?: number): string {
  const digits = text.replace(/\D/g, '');
  const cap = total ?? LAST_CHAPTER;
  return Number(digits) > cap ? String(cap) : digits;
}

/**
 * The field after its back or forward button: one chapter, kept between
 * `from` and the cap. From an empty or too-low value, either lands on `from`.
 */
export function stepThroughChapter(text: string, step: 1 | -1, from: number, total?: number): string {
  return String(Math.min(total ?? LAST_CHAPTER, Math.max(from, Number(text) + step)));
}

/**
 * Every chapter from `from`, the next unread one, through the field's value,
 * as the request's `entryEpisodes`. AniList saves the last as one progress
 * write. Null below `from`: a lower number would lower the counter or
 * reconcile as a reread.
 */
export function chaptersThrough(from: number, text: string): number[] | null {
  const through = Number(text);
  if (through < from) return null;
  return Array.from({ length: through - from + 1 }, (_, index) => from + index);
}
