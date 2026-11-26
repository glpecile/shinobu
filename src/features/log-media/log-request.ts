import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import type { LogMediaVariables } from './fan-out';
import type { ReadingProgress } from './reading-progress-field';

export type LogRequest = Pick<
  LogMediaVariables,
  'item' | 'episodes' | 'entryEpisodes' | 'watchedAt' | 'tags' | 'liked'
> & {
  title: string;
  description: string;
  entry?: UpNextEpisodeEntry;
  batch?: boolean;
  chapterRange?: { from: number; total?: number };
  reading?: ReadingProgress;
};

export function isEpisodeLog(request: LogRequest): boolean {
  const { item } = request;
  return (
    !request.batch &&
    item.type !== 'MOVIE' &&
    item.type !== 'MANGA' &&
    item.isFilm !== true &&
    (request.episodes?.length === 1 || request.entryEpisodes?.length === 1)
  );
}
