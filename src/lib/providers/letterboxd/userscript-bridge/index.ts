import type { LetterboxdWatchlistWebFetch, LetterboxdWebFetch } from '@/lib/providers/letterboxd/deps';

export function hasLetterboxdUserscript(_capability: 'log' | 'watchlist' | 'watchlist-remove' | 'like' = 'log'): boolean {
  return false;
}

export function useLetterboxdUserscript(_capability: 'log' | 'watchlist' | 'watchlist-remove' | 'like' = 'log'): boolean {
  return false;
}

export function getLetterboxdUserscriptFetch(_username: string | null): LetterboxdWebFetch | undefined {
  return undefined;
}

export function getLetterboxdUserscriptWatchlistFetch(_username: string | null): LetterboxdWatchlistWebFetch | undefined {
  return undefined;
}
