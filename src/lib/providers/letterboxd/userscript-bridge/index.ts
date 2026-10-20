import type { LetterboxdListCreateFetch, LetterboxdListRenameFetch, LetterboxdListMembershipFetch, LetterboxdListLikeWebFetch, LetterboxdWatchlistWebFetch, LetterboxdWebFetch } from '@/lib/providers/letterboxd/deps';

export function hasLetterboxdUserscript(_capability: 'log' | 'watchlist' | 'watchlist-remove' | 'like' | 'list-like' | 'list-membership' | 'list-create' | 'list-rename' = 'log'): boolean {
  return false;
}

export function useLetterboxdUserscript(_capability: 'log' | 'watchlist' | 'watchlist-remove' | 'like' | 'list-like' | 'list-membership' | 'list-create' | 'list-rename' = 'log'): boolean {
  return false;
}

export function getLetterboxdUserscriptFetch(_username: string | null): LetterboxdWebFetch | undefined {
  return undefined;
}

export function getLetterboxdUserscriptWatchlistFetch(_username: string | null): LetterboxdWatchlistWebFetch | undefined {
  return undefined;
}

export function getLetterboxdUserscriptListLikeFetch(_username: string | null): LetterboxdListLikeWebFetch | undefined {
  return undefined;
}

export function getLetterboxdUserscriptListMembershipFetch(_username: string | null): LetterboxdListMembershipFetch | undefined {
  return undefined;
}

export function getLetterboxdUserscriptListCreateFetch(_username: string | null): LetterboxdListCreateFetch | undefined {
  return undefined;
}

export function getLetterboxdUserscriptListRenameFetch(_username: string | null): LetterboxdListRenameFetch | undefined {
  return undefined;
}
