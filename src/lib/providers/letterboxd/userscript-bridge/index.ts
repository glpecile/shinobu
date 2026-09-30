import type { LetterboxdWebFetch } from '@/lib/providers/letterboxd/deps';

export function hasLetterboxdUserscript(): boolean {
  return false;
}

export function useLetterboxdUserscript(): boolean {
  return false;
}

export function getLetterboxdUserscriptFetch(_username: string | null): LetterboxdWebFetch | undefined {
  return undefined;
}
