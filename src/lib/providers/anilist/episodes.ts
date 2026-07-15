import { Effect } from 'effect';

import type { ProviderError } from '@/lib/providers/errors';
import type { NormalizedEpisode, NormalizedSeason } from '@/types/media';
import type { AniListDeps } from './deps';
import { anilistRequest } from './http';

interface AniListAiringNode {
  episode: number;
  /** Unix seconds. */
  airingAt: number;
}

interface AniListStreamingEpisode {
  title: string;
  thumbnail: string;
}

interface AnimeEpisodesResponse {
  Media: {
    episodes: number | null;
    duration: number | null;
    airingSchedule: {
      edges: Array<{ node: AniListAiringNode } | null> | null;
    } | null;
    streamingEpisodes: Array<AniListStreamingEpisode | null> | null;
  } | null;
}

function airingInstant(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

/**
 * Per-episode data for one anime series: titles, thumbnails, and air instants.
 * Falls back to synthetic "Episode N" rows when AniList has no streaming
 * metadata, and treats any episode without an air date as already aired (the
 * common case for catalogue/back-catalogue entries where schedules aren't
 * retained).
 */
export function getAnimeEpisodes(
  deps: AniListDeps,
  params: { mediaId: number },
): Effect.Effect<NormalizedSeason, ProviderError> {
  return Effect.gen(function* () {
    const data = yield* anilistRequest<AnimeEpisodesResponse>(
      deps,
      `query ($mediaId: Int) {
        Media(id: $mediaId) {
          episodes
          duration
          airingSchedule(page: 1, perPage: 100) {
            edges { node { episode airingAt } }
          }
          streamingEpisodes {
            title
            thumbnail
          }
        }
      }`,
      { variables: { mediaId: params.mediaId } },
    );

    const media = data.Media;
    if (media == null) {
      return buildSeason([]);
    }

    const airByEpisode = new Map<number, string>();
    for (const edge of media.airingSchedule?.edges ?? []) {
      if (edge?.node == null) continue;
      airByEpisode.set(edge.node.episode, airingInstant(edge.node.airingAt));
    }

    const streaming = (media.streamingEpisodes ?? []).filter(
      (episode): episode is AniListStreamingEpisode => episode != null,
    );

    // Ongoing anime has no final `episodes` count and commonly no streaming
    // metadata, but its airing schedule still identifies every known episode.
    const scheduledCount = Math.max(0, ...airByEpisode.keys());
    const count = media.episodes ?? Math.max(streaming.length, scheduledCount);
    const duration = media.duration ?? undefined;

    const episodes: NormalizedEpisode[] = [];
    for (let number = 1; number <= count; number++) {
      const streamingEpisode = streaming[number - 1];
      episodes.push({
        number,
        title: streamingEpisode?.title ?? `Episode ${number}`,
        ...(airByEpisode.has(number)
          ? { firstAired: airByEpisode.get(number) }
          : {}),
        ...(duration != null ? { runtime: duration } : {}),
      });
    }

    return buildSeason(episodes);
  });
}

function buildSeason(episodes: NormalizedEpisode[]): NormalizedSeason {
  return {
    number: 1,
    title: 'Season 1',
    episodes,
  };
}
