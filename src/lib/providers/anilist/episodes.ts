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

export interface AnimeEpisodesResponse {
  Media: {
    episodes: number | null;
    duration: number | null;
    airingSchedule: {
      pageInfo?: { hasNextPage: boolean };
      edges: Array<{ node: AniListAiringNode } | null> | null;
    } | null;
    streamingEpisodes: Array<AniListStreamingEpisode | null> | null;
  } | null;
}

/** Shared by the episode-only read and the detail screen's combined read. */
export const EPISODE_FIELDS = `
  episodes
  duration
  airingSchedule(page: 1, perPage: 25) {
    pageInfo { hasNextPage }
    edges { node { episode airingAt } }
  }
  streamingEpisodes { title thumbnail }
`;

function airingInstant(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

/**
 * Per-episode data for one anime series: titles, thumbnails, and air instants.
 * Falls back to synthetic "Episode N" rows when AniList has no streaming
 * metadata, so an announced season comes back as a full list with no dates at
 * all; an absent `firstAired` is not a claim that the episode aired
 * (`hasStartedAiring`).
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
          ${EPISODE_FIELDS}
        }
      }`,
      { variables: { mediaId: params.mediaId } },
    );

    yield* completeAiringSchedule(deps, params.mediaId, data.Media);
    return normalizeAnimeEpisodes(data.Media);
  });
}

/** AniList caps airing connections at 25 even when perPage asks for more. */
export const completeAiringSchedule = Effect.fnUntraced(function*(
  deps: AniListDeps,
  mediaId: number,
  media: Partial<NonNullable<AnimeEpisodesResponse['Media']>> | null,
): Effect.fn.Return<void, ProviderError> {
  let schedule = media?.airingSchedule;
  for (let page = 2; schedule?.pageInfo?.hasNextPage === true; page++) {
    const data = yield* anilistRequest<AnimeEpisodesResponse>(deps,
      `query ($id: Int, $page: Int) { Media(id: $id) {
        airingSchedule(page: $page, perPage: 25) {
          pageInfo { hasNextPage } edges { node { episode airingAt } }
        }
      } }`, { variables: { id: mediaId, page } });
    schedule = data.Media?.airingSchedule;
    if (media?.airingSchedule != null) {
      media.airingSchedule.edges = [...(media.airingSchedule.edges ?? []), ...(schedule?.edges ?? [])];
      media.airingSchedule.pageInfo = schedule?.pageInfo;
    }
  }
});

export function normalizeAnimeEpisodes(media: Partial<NonNullable<AnimeEpisodesResponse['Media']>> | null): NormalizedSeason {
  if (media == null) {
    return buildSeason([]);
  }

  const airByEpisode = new Map<number, string>();
  for (const edge of media.airingSchedule?.edges ?? []) {
    if (edge?.node == null) continue;
    airByEpisode.set(edge.node.episode, airingInstant(edge.node.airingAt));
  }

  // Streaming lists can be newest-first or contain several providers.
  // Array position is not an episode number. Unnumbered titles stay unknown.
  const streaming = new Map<number, AniListStreamingEpisode>();
  for (const episode of media.streamingEpisodes ?? []) {
    const match = episode?.title.match(/^Episode\s+(\d+)\s*(?:[-–—:]|$)/i);
    if (episode == null || match == null) continue;
    const number = Number(match[1]);
    if (number > 0 && !streaming.has(number)) streaming.set(number, episode);
  }

  // Ongoing anime has no final `episodes` count and commonly no streaming
  // metadata, but its airing schedule still identifies every known episode.
  const scheduledCount = Math.max(0, ...airByEpisode.keys());
  const count = media.episodes ?? Math.max(0, ...streaming.keys(), scheduledCount);
  const duration = media.duration ?? undefined;

  const episodes: NormalizedEpisode[] = [];
  for (let number = 1; number <= count; number++) {
    const streamingEpisode = streaming.get(number);
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
}

/**
 * One AniList entry is one section, and its episodes are numbered 1..n
 * *relative to that entry* — which is all this function knows. `number: 1` is
 * the section's index, not a claim about the canonical season: a sequel entry's
 * episode 1 may well be S02E01 or S03E13 (plan 0027). The neutral "Episodes"
 * title is the honest default; the details accordion replaces it with the real
 * canonical season once ani.zip's table resolves one, and never with
 * "Season 1". Watched-checkmark keys stay `1-{n}` for the same reason — they
 * derive from the entry's own progress.
 */
function buildSeason(episodes: NormalizedEpisode[]): NormalizedSeason {
  return {
    number: 1,
    title: 'Episodes',
    episodes,
  };
}
