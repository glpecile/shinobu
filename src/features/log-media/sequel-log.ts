import type { AnimeRelations } from '@/lib/providers/anilist/relations';
import type { LogRequest } from './log-request';
import { airedAnimeEpisodes } from './session/queue';

export function sequelLogRequest(sequel: AnimeRelations | null): LogRequest | null {
  if (sequel?.item == null || sequel.entryState == null || sequel.season == null) return null;
  const { item } = sequel;
  const { entry } = sequel.entryState;
  if (entry?.status === 'COMPLETED') return null;
  const number = (entry?.progress ?? 0) + 1;
  const aired = airedAnimeEpisodes(item, sequel.season.episodes, null);
  if (!aired.some((episode) => episode.number === number)) return null;
  return {
    item,
    title: `Log episode ${number}`,
    description: `“${item.title}”`,
    entryEpisodes: [number],
  };
}
