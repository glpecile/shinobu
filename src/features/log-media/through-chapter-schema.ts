import { z } from 'zod';

/**
 * The cap on the "through chapter" field when AniList has no total.
 * `entryEpisodes` lists every chapter of a range, so a stray keystroke can't
 * build a huge one. The longest-running manga have about 2,000 chapters.
 */
const LAST_CHAPTER = 9999;

/** What the field shows for typed `text`: its digits, clamped to the total or `LAST_CHAPTER`. */
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
 * The manga log form's "through chapter" rule (plan 0117 M2). It parses into
 * every chapter from `from`, the next unread one, through the field's value:
 * the request's `entryEpisodes`, which AniList saves as one progress write at
 * the last. A value below `from` is refused, because it would lower the
 * counter or reconcile as a reread.
 */
export function throughChapterSchema(from: number) {
  return z.object({
    through: z.string().refine((text) => Number(text) >= from, `Enter chapter ${from} or later.`),
  }).transform(({ through }) => ({
    chapters: Array.from({ length: Number(through) - from + 1 }, (_, index) => from + index),
  }));
}

export type ThroughChapterForm = z.input<ReturnType<typeof throughChapterSchema>>;
export type ThroughChapters = z.output<ReturnType<typeof throughChapterSchema>>;
