import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';

import type { ProviderError } from '@/lib/providers/errors';
import type {
  NormalizedCharacter,
  NormalizedCrewMember,
  NormalizedMediaItem,
  NormalizedSeason,
} from '@/types/media';

import {
  normalizeCharacters,
  normalizeCrew,
  type AniListCharacterRoleEdge,
  type AniListStaffEdge,
} from './credits';
import type { AniListDeps } from './deps';
import {
  completeAiringSchedule,
  EPISODE_FIELDS,
  normalizeAnimeEpisodes,
  type AnimeEpisodesResponse,
} from './episodes';
import { anilistAuthedRequest, anilistRequest } from './http';
import { humanizeEnum, normalizeAniListMedia, type AniListMedia } from './normalize';
import {
  CARD_FIELDS,
  ENTRY_FIELDS,
  MEDIA_FIELDS,
  normalizeEntryState,
  type AniListEntryState,
  type MediaEntryResponse,
} from './reads';

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
  } & AniListMedia & Partial<NonNullable<MediaEntryResponse['Media']>> & Partial<NonNullable<AnimeEpisodesResponse['Media']>> | null;
}

export interface AnimeRelation {
  /** "Side story", "Sequel" — the enum, humanized, for the card's subtitle. */
  relation: string;
  item: NormalizedMediaItem;
}

export interface AnimeRelations {
  item: NormalizedMediaItem | null;
  /** Null for public reads, not a claim that the viewer has no entry. */
  entryState: AniListEntryState | null;
  /** Anime episodes share this round-trip; manga has no season. */
  season: NormalizedSeason | null;
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

/**
 * Details and connections share one operation, including entry state when
 * connected. Long airing schedules continue through their remaining pages.
 *
 * `withCredits` is for manga, which TMDB can't credit. Anime asks for its
 * episodes instead, so opening a title doesn't spend a separate request on
 * each detail section. Anime credits still come from `getMediaDetails`.
 */
export function getAnimeRelations(
  deps: AniListDeps,
  params: { mediaId: number; withCredits: boolean },
): Effect.Effect<AnimeRelations, ProviderError> {
  return Effect.gen(function* () {
    const withEntry = deps.tokens.get() != null;
    const request = (authenticated: boolean) => (authenticated ? anilistAuthedRequest : anilistRequest)<RelationsResponse>(
      deps,
      `query ($id: Int, $withCredits: Boolean!, $withEntry: Boolean!) {
        Media(id: $id) {
          ${MEDIA_FIELDS}
          mediaListEntry @include(if: $withEntry) { ${ENTRY_FIELDS} }
          ${params.withCredits ? '' : EPISODE_FIELDS}
          characters(sort: [ROLE, RELEVANCE, ID], perPage: 15) @include(if: $withCredits) {
            edges { role node { id name { full } image { large } } }
          }
          staff(sort: [RELEVANCE, ID], perPage: 20) @include(if: $withCredits) {
            edges { role node { id name { full } image { large } } }
          }
          tags { name isMediaSpoiler }
          relations { edges { relationType node { ${CARD_FIELDS} } } }
          recommendations(sort: [RATING_DESC, ID], perPage: 15) {
            nodes { mediaRecommendation { ${CARD_FIELDS} } }
          }
        }
      }`,
      { variables: { id: params.mediaId, withCredits: params.withCredits, withEntry: authenticated } },
    );
    let authenticated = withEntry;
    const data = yield* request(withEntry).pipe(Effect.catchTag('ProviderAuthError', () => {
      authenticated = false;
      return request(false);
    }));
    if (!params.withCredits) yield* completeAiringSchedule(deps, params.mediaId, data.Media);
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return {
      item: data.Media == null ? null : normalizeAniListMedia(data.Media, nowIso),
      entryState: authenticated ? normalizeEntryState(data.Media) : null,
      season: params.withCredits ? null : normalizeAnimeEpisodes(data.Media),
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
      characters: normalizeCharacters(data.Media?.characters?.edges ?? null),
      staff: normalizeCrew(data.Media?.staff?.edges ?? null),
    };
  });
}
