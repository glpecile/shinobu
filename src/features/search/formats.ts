import { Provider } from '@/lib/providers/types';

/** One search section and its request. Trakt backs movies-tv without TMDB. */
type TitleSource =
  | { source: 'movies-tv'; label: string }
  | { source: typeof Provider.AniList; type: 'ALL' | 'MANGA'; label: string };

/** Reading sources share one FAB option; an omitted source sends no request. */
export const TITLE_SOURCES = {
  ALL: [
    { source: 'movies-tv', label: 'Movies & TV' },
    { source: Provider.AniList, type: 'ALL', label: 'Anime & Manga' },
  ],
  READING: [{ source: Provider.AniList, type: 'MANGA', label: 'Manga & light novels' }],
} satisfies Record<'ALL' | 'READING', readonly TitleSource[]>;
