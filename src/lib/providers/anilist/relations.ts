import { Clock, Effect } from 'effect';

import type { ProviderError } from '@/lib/providers/errors';
import type {
  NormalizedCharacter,
  NormalizedCrewMember,
  NormalizedMediaItem,
} from '@/types/media';

import {
  normalizeCharacters,
  normalizeCrew,
  type AniListCharacterRoleEdge,
  type AniListStaffEdge,
} from './credits';
import type { AniListDeps } from './deps';
import { anilistRequest } from './http';
import { humanizeEnum, normalizeAniListMedia, type AniListMedia } from './normalize';
import { MEDIA_FIELDS } from './reads';

interface RelationsResponse {
  Media: {
    tags: Array<{ name: string | null; isMediaSpoiler: boolean | null } | null> | null;
    relations: {
      edges: Array<{
        /** MediaRelation enum: PREQUEL, SEQUEL, PARENT, SIDE_STORY, ADAPTATION, SOURCE, … */
        relationType: string | null;
        node: AniListMedia | null;
      } | null> | null;
    } | null;
    recommendations: {
      nodes: Array<{ mediaRecommendation: AniListMedia | null } | null> | null;
    } | null;
    characters?: { edges: AniListCharacterRoleEdge[] | null } | null;
    staff?: { edges: AniListStaffEdge[] | null } | null;
  } | null;
}

export interface AnimeRelation {
  /** "Side story", "Sequel" — the enum, humanized, for the card's subtitle. */
  relation: string;
  item: NormalizedMediaItem;
}

export interface AnimeRelations {
  relations: AnimeRelation[];
  /** Community recommendations, best-rated first. */
  recommendations: NormalizedMediaItem[];
  /** Tag names, most-voted first; spoiler tags dropped. */
  tags: string[];
  /** Empty unless asked for with `withCredits`. */
  characters: NormalizedCharacter[];
  /** Empty unless asked for with `withCredits`. */
  staff: NormalizedCrewMember[];
}

const RECOMMENDATIONS_PER_PAGE = 15;

/**
 * Everything AniList links from one media (anime and manga): relations,
 * recommendations and tags, plus characters and staff with `withCredits`. One
 * request for all of it — the 30 req/min budget
 * (docs/solutions/anilist-rate-limit-retry-storm.md). Public data.
 *
 * `withCredits` is for manga, which TMDB can't credit: anime credits come from
 * `getMediaDetails`, and asking here too would fetch them twice.
 */
export function getAnimeRelations(
  deps: AniListDeps,
  params: { mediaId: number; withCredits: boolean },
): Effect.Effect<AnimeRelations, ProviderError> {
  return Effect.gen(function* () {
    const data = yield* anilistRequest<RelationsResponse>(
      deps,
      `query ($id: Int, $perPage: Int, $withCredits: Boolean!) {
        Media(id: $id) {
          characters(sort: [ROLE, RELEVANCE, ID], perPage: 15) @include(if: $withCredits) {
            edges { role node { id name { full } image { large } } }
          }
          staff(sort: [RELEVANCE, ID], perPage: 20) @include(if: $withCredits) {
            edges { role node { id name { full } image { large } } }
          }
          tags { name isMediaSpoiler }
          relations { edges { relationType node { ${MEDIA_FIELDS} } } }
          recommendations(sort: [RATING_DESC, ID], perPage: $perPage) {
            nodes { mediaRecommendation { ${MEDIA_FIELDS} } }
          }
        }
      }`,
      {
        variables: {
          id: params.mediaId,
          perPage: RECOMMENDATIONS_PER_PAGE,
          withCredits: params.withCredits,
        },
      },
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return {
      relations: (data.Media?.relations?.edges ?? []).flatMap((edge) =>
        edge?.node == null
          ? []
          : [{
              relation: humanizeEnum(edge.relationType ?? 'OTHER'),
              item: normalizeAniListMedia(edge.node, nowIso),
            }],
      ),
      recommendations: (data.Media?.recommendations?.nodes ?? []).flatMap((node) =>
        node?.mediaRecommendation == null
          ? []
          : [normalizeAniListMedia(node.mediaRecommendation, nowIso)],
      ),
      tags: (data.Media?.tags ?? []).flatMap((tag) =>
        tag?.name == null || tag.isMediaSpoiler === true ? [] : [tag.name],
      ),
      characters: normalizeCharacters(data.Media?.characters?.edges ?? []),
      staff: normalizeCrew(data.Media?.staff?.edges ?? []),
    };
  });
}
