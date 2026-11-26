import { z } from 'zod';

const LAST_CHAPTER = 9999;

function chapterCap(from: number, total?: number): number {
  return total ?? Math.max(LAST_CHAPTER, from);
}

export function throughChapterText(text: string, from: number, total?: number): string {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? '' : String(Math.min(Number(digits), chapterCap(from, total)));
}

export function stepThroughChapter(
  text: string,
  step: 1 | -1,
  from: number,
  total?: number,
): string {
  return String(Math.min(chapterCap(from, total), Math.max(from, Number(text) + step)));
}

export function chaptersThrough(from: number, through: number): number[] {
  return Array.from({ length: through - from + 1 }, (_, index) => from + index);
}

export function throughChapterSchema(from: number) {
  return z.object({
    through: z.string().refine((text) => Number(text) >= from, `Enter chapter ${from} or later.`),
  });
}

export type ThroughChapterForm = z.infer<ReturnType<typeof throughChapterSchema>>;
