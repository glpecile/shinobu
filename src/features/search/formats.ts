import { FORMAT_OPTIONS, type FormatFilter } from '@/features/credit-timeline/group';
import { Provider } from '@/lib/providers/types';

/**
 * The search tab's Titles formats: the filmography and diary list, where an
 * anime film is a movie and an anime series is TV (`matchesFormat`), plus
 * Reading, the one option for everything read. Rides the URL as `?format=`.
 */
export type SearchFormat = FormatFilter | 'READING';

export const SEARCH_FORMAT_OPTIONS = [
  ...FORMAT_OPTIONS,
  { value: 'READING', label: 'Reading' },
] as const satisfies readonly { value: SearchFormat; label: string; accessibilityLabel?: string }[];

/**
 * One Titles section and how it narrows its request. `movies-tv` is TMDB, or
 * Trakt when the build has no TMDB token.
 */
export type TitleSource =
  | { source: 'movies-tv'; type: 'ALL' | 'MOVIE' | 'TV'; label: string }
  | { source: typeof Provider.AniList; type: 'ALL' | 'MOVIE' | 'TV' | 'MANGA'; label: string };

/**
 * The sections each format searches, in screen order. A source missing from a
 * format sends no request under it. Hardcover's books (#400) and the comics
 * tracker (#401) join Reading here as sources, never as options of their own,
 * so their labels name what they hold beside AniList's.
 */
export const TITLE_SOURCES: Record<SearchFormat, readonly TitleSource[]> = {
  ALL: [
    { source: 'movies-tv', type: 'ALL', label: 'Movies & TV' },
    { source: Provider.AniList, type: 'ALL', label: 'Anime & Manga' },
  ],
  MOVIE: [
    { source: 'movies-tv', type: 'MOVIE', label: 'Movies' },
    { source: Provider.AniList, type: 'MOVIE', label: 'Anime films' },
  ],
  TV: [
    { source: 'movies-tv', type: 'TV', label: 'TV' },
    { source: Provider.AniList, type: 'TV', label: 'Anime series' },
  ],
  READING: [{ source: Provider.AniList, type: 'MANGA', label: 'Manga & light novels' }],
};

/** `?format=` → a format; anything else is All, so a stale link still searches. */
export function parseSearchFormat(param: string | undefined): SearchFormat {
  return SEARCH_FORMAT_OPTIONS.find((option) => option.value === param)?.value ?? 'ALL';
}
