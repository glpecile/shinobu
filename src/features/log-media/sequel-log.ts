import type { AnimeRelations } from '@/lib/providers/anilist/relations';
import type { LogRequest } from './log-request';
import { airedAnimeEpisodes } from './session/queue';

/**
 * The log that carries a finished anime entry into its sequel: the sequel's
 * next episode, once it has aired. Null without the viewer's AniList entry
 * state, because a public read can't say which episode is next.
 */
export function sequelLogRequest(sequel: AnimeRelations | null): LogRequest | null {
  if (sequel?.item == null || sequel.entryState == null || sequel.season == null) return null;
  const { item } = sequel;
  const number = (sequel.entryState.entry?.progress ?? 0) + 1;
  const aired = airedAnimeEpisodes(item, sequel.season.episodes, null);
  if (!aired.some((episode) => episode.number === number)) return null;
  return {
    item,
    title: `Log episode ${number}`,
    description: `“${item.title}”`,
    entryEpisodes: [number],
  };
}
