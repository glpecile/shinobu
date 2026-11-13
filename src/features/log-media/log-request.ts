import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import type { LogMediaVariables } from './fan-out';
import type { ReadingProgress } from './reading-progress-field';

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
  /** A book log's starting form state (plan 0117 B3). The form owns the edits. */
  reading?: ReadingProgress;
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
