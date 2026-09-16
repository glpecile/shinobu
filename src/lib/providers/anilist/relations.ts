import { Clock, Effect } from 'effect';

import type { ProviderError } from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';

import type { AniListDeps } from './deps';
import { anilistRequest } from './http';
import { normalizeAniListMedia, type AniListMedia } from './normalize';
import { MEDIA_FIELDS } from './reads';

interface RelationsResponse {
  Media: {
    relations: {
      edges: Array<{
        /** MediaRelation enum: PREQUEL, SEQUEL, PARENT, SIDE_STORY, ADAPTATION, SOURCE, … */
        relationType: string | null;
        node: AniListMedia | null;
      } | null> | null;
    } | null;
  } | null;
}

export interface AnimeRelation {
  /** "Side story", "Sequel" — the enum, humanized, for the card's subtitle. */
  relation: string;
  item: NormalizedMediaItem;
}

function humanize(relationType: string): string {
  const lower = relationType.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Every media AniList links from this one (anime and manga), in AniList's order. Public data. */
export function getAnimeRelations(
  deps: AniListDeps,
  params: { mediaId: number },
): Effect.Effect<AnimeRelation[], ProviderError> {
  return Effect.gen(function* () {
    const data = yield* anilistRequest<RelationsResponse>(
      deps,
      `query ($id: Int) {
        Media(id: $id) {
          relations { edges { relationType node { ${MEDIA_FIELDS} } } }
        }
      }`,
      { variables: { id: params.mediaId } },
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return (data.Media?.relations?.edges ?? []).flatMap((edge) =>
      edge?.node == null
        ? []
        : [{
            relation: humanize(edge.relationType ?? 'OTHER'),
            item: normalizeAniListMedia(edge.node, nowIso),
          }],
    );
  });
}
