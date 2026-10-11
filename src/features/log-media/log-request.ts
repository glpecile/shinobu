import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import type { LogMediaVariables } from './fan-out';

/** The trigger supplies intent; the app-level session owns the form and write. */
export type LogRequest = Pick<LogMediaVariables, 'item' | 'episodes' | 'entryEpisodes' | 'watchedAt' | 'tags' | 'liked'> & {
  title: string;
  description: string;
  entry?: UpNextEpisodeEntry;
  /** Season-wide selections stay batched even when only one episode has aired. */
  batch?: boolean;
};

export function isEpisodeLog(request: LogRequest): boolean {
  const { item } = request;
  return !request.batch && item.type !== 'MOVIE' && item.isFilm !== true &&
    (request.episodes?.length === 1 || request.entryEpisodes?.length === 1);
}
