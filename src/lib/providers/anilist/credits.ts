import { Effect } from 'effect';

import type {
  NormalizedCastMember,
  NormalizedCharacter,
  NormalizedCrewMember,
  NormalizedStudio,
} from '@/types/media';
import type { ProviderError } from '@/lib/providers/errors';
import type { AniListDeps } from './deps';
import { anilistRequest } from './http';
import { humanizeEnum } from './normalize';

interface AniListPerson {
  id: number;
  name: { full: string | null } | null;
  image: { large: string | null } | null;
}

interface AniListCharacter {
  name: { full: string | null } | null;
}

type AniListCharacterEdge = {
  node: AniListCharacter | null;
  voiceActors: Array<AniListPerson | null> | null;
} | null;

/** A character with the fields a manga's Characters rail shows. */
export type AniListCharacterRoleEdge = {
  /** CharacterRole enum: MAIN, SUPPORTING, BACKGROUND. */
  role: string | null;
  node: {
    id: number;
    name: { full: string | null } | null;
    image: { large: string | null } | null;
  } | null;
} | null;

export type AniListStaffEdge = {
  role: string | null;
  node: AniListPerson | null;
} | null;

type AniListStudio = { id: number; name: string | null } | null;

interface AnimeCreditsResponse {
  Media: {
    characters: {
      edges: AniListCharacterEdge[] | null;
    } | null;
    staff: {
      edges: AniListStaffEdge[] | null;
    } | null;
    studios: {
      nodes: AniListStudio[] | null;
    } | null;
  } | null;
}

export interface AnimeCredits {
  cast: NormalizedCastMember[];
  crew: NormalizedCrewMember[];
  studios: NormalizedStudio[];
}

function personName(person: AniListPerson): string {
  return person.name?.full ?? '';
}

/** AniList's "NO IMAGE" placeholder counts as no image, so the initials fallback renders. */
function anilistImage(image: { large: string | null } | null): string {
  const url = image?.large ?? '';
  return url.endsWith('/default.jpg') ? '' : url;
}

function personHeadshot(person: AniListPerson): string {
  return anilistImage(person.image);
}

function normalizeCast(
  edges: AniListCharacterEdge[] | null,
): NormalizedCastMember[] {
  const byPerson = new Map<string, { member: NormalizedCastMember; characters: string[] }>();
  for (const edge of edges ?? []) {
    const character = edge?.node?.name?.full ?? '';
    for (const voiceActor of edge?.voiceActors ?? []) {
      if (voiceActor == null) continue;
      const id = `anilist-person-${voiceActor.id}`;
      const existing = byPerson.get(id);
      if (existing != null) {
        if (character !== '') existing.characters.push(character);
        continue;
      }

      byPerson.set(id, {
        member: {
          id,
          name: personName(voiceActor),
          character: '',
          headshot: personHeadshot(voiceActor),
          anilistId: voiceActor.id,
        },
        characters: character !== '' ? [character] : [],
      });
    }
  }

  return [...byPerson.values()].map(({ member, characters }) => ({
    ...member,
    character: [...new Set(characters)].join(', '),
  }));
}

export function normalizeCharacters(
  edges: AniListCharacterRoleEdge[] | null,
): NormalizedCharacter[] {
  return (edges ?? []).flatMap((edge) =>
    edge?.node == null
      ? []
      : [{
          anilistId: edge.node.id,
          name: edge.node.name?.full ?? '',
          role: edge.role == null ? '' : humanizeEnum(edge.role),
          image: anilistImage(edge.node.image),
        }],
  );
}

export function normalizeCrew(
  edges: AniListStaffEdge[] | null,
): NormalizedCrewMember[] {
  const byPerson = new Map<string, { member: NormalizedCrewMember; jobs: string[] }>();
  for (const edge of edges ?? []) {
    if (edge == null || edge.node == null) continue;
    const person = edge.node;

    const id = `anilist-person-${person.id}`;
    const existing = byPerson.get(id);
    if (existing != null) {
      if (edge.role != null) existing.jobs.push(edge.role);
      continue;
    }

    byPerson.set(id, {
      member: {
        id,
        name: personName(person),
        job: '',
        headshot: personHeadshot(person),
        anilistId: person.id,
      },
      jobs: edge.role != null ? [edge.role] : [],
    });
  }

  return [...byPerson.values()].map(({ member, jobs }) => ({
    ...member,
    job: [...new Set(jobs)].join(', '),
  }));
}

function normalizeStudios(
  nodes: AniListStudio[] | null,
): NormalizedStudio[] {
  const studios = new Map<string, NormalizedStudio>();
  for (const studio of nodes ?? []) {
    if (studio == null || studio.name == null || studio.name === '') continue;
    const id = `anilist-studio-${studio.id}`;
    // The numeric id rides along (plan 0035 R12): it is what deep-links the
    // studio sheet straight to anilist.co/studio/{id}, no name search needed.
    if (!studios.has(id)) {
      studios.set(id, {
        id,
        name: studio.name,
        ...(studio.id != null ? { anilistId: studio.id } : {}),
      });
    }
  }
  return [...studios.values()];
}

/**
 * Anime credits for a detail view. AniList models cast as characters with one
 * or more voice actors, so the visible person is the voice actor and the
 * character remains the card subtitle.
 */
export function getAnimeCredits(
  deps: AniListDeps,
  params: { mediaId: number },
): Effect.Effect<AnimeCredits, ProviderError> {
  return anilistRequest<AnimeCreditsResponse>(
    deps,
    `query ($mediaId: Int) {
      Media(id: $mediaId) {
        characters(sort: [ROLE, RELEVANCE, ID], perPage: 15) {
          edges {
            node { name { full } }
            voiceActors(language: JAPANESE) { id name { full } image { large } }
          }
        }
        staff(sort: [RELEVANCE, ID], perPage: 20) {
          edges { role node { id name { full } image { large } } }
        }
        studios { nodes { id name } }
      }
    }`,
    { variables: { mediaId: params.mediaId } },
  ).pipe(
    Effect.map((data) => ({
      cast: normalizeCast(data.Media?.characters?.edges ?? []),
      crew: normalizeCrew(data.Media?.staff?.edges ?? []),
      studios: normalizeStudios(data.Media?.studios?.nodes ?? []),
    })),
  );
}
