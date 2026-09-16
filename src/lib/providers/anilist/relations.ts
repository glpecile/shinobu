import { Clock, Effect } from 'effect';

import type { ProviderError } from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';

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
}

const RECOMMENDATIONS_PER_PAGE = 15;

/**
 * Everything AniList links from one media (anime and manga): relations,
 * recommendations and tags. One request for all three — the 30 req/min budget
 * (docs/solutions/anilist-rate-limit-retry-storm.md). Public data.
 */
export function getAnimeRelations(
  deps: AniListDeps,
  params: { mediaId: number },
): Effect.Effect<AnimeRelations, ProviderError> {
  return Effect.gen(function* () {
    const data = yield* anilistRequest<RelationsResponse>(
      deps,
      `query ($id: Int, $perPage: Int) {
        Media(id: $id) {
          tags { name isMediaSpoiler }
          relations { edges { relationType node { ${MEDIA_FIELDS} } } }
          recommendations(sort: [RATING_DESC, ID], perPage: $perPage) {
            nodes { mediaRecommendation { ${MEDIA_FIELDS} } }
          }
        }
      }`,
      { variables: { id: params.mediaId, perPage: RECOMMENDATIONS_PER_PAGE } },
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
    };
  });
}
