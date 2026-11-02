import { z } from 'zod';

/**
 * The cap on the "through chapter" field when AniList has no total.
 * `entryEpisodes` lists every chapter of a range, so a stray keystroke can't
 * build a huge one. The longest-running manga have about 2,000 chapters.
 */
const LAST_CHAPTER = 9999;

/** The highest chapter the field accepts: the total, else `LAST_CHAPTER`, never below `from`. */
function chapterCap(from: number, total?: number): number {
  return total ?? Math.max(LAST_CHAPTER, from);
}

/** What the field shows for typed `text`: its digits as a number, clamped to the cap. */
export function throughChapterText(text: string, from: number, total?: number): string {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? '' : String(Math.min(Number(digits), chapterCap(from, total)));
}

/**
 * The field after its back or forward button: one chapter, kept between
 * `from` and the cap. From an empty or too-low value, either lands on `from`.
 */
export function stepThroughChapter(text: string, step: 1 | -1, from: number, total?: number): string {
  return String(Math.min(chapterCap(from, total), Math.max(from, Number(text) + step)));
}

/**
 * Every chapter from `from`, the next unread one, through `through`: the
 * request's `entryEpisodes`, which AniList saves as one progress write at the
 * last.
 */
export function chaptersThrough(from: number, through: number): number[] {
  return Array.from({ length: through - from + 1 }, (_, index) => from + index);
}

/**
 * The manga log form's "through chapter" rule (plan 0117 M2). A value below
 * `from` is refused, because it would lower the counter or reconcile as a
 * reread.
 */
export function throughChapterSchema(from: number) {
  return z.object({
    through: z.string().refine((text) => Number(text) >= from, `Enter chapter ${from} or later.`),
  });
}

export type ThroughChapterForm = z.infer<ReturnType<typeof throughChapterSchema>>;
