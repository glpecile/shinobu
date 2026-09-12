import { Effect } from 'effect';

import type { AniListDeps } from '@/lib/providers/anilist/deps';
import {
  getAniListStaff,
  searchAniListStaff,
} from '@/lib/providers/anilist/reads';
import type { ProviderError } from '@/lib/providers/errors';
import type { TmdbDeps } from '@/lib/providers/tmdb/deps';
import {
  pickPersonMatch,
  type NormalizedPersonDetails,
} from '@/lib/providers/tmdb/normalize';
import { getPerson, searchPerson } from '@/lib/providers/tmdb/reads';

export interface PersonDetailsDeps {
  /** Null when no TMDB token is configured — straight to the AniList leg. */
  tmdb: TmdbDeps | null;
  anilist: AniListDeps;
}

/**
 * Name → a person page, TMDB first and AniList second — the composed read
 * behind `/person/lookup`, mirroring `getMediaDetails`' failover for titles.
 * The route only ever sees credits with no TMDB person id, which come from
 * AniList anime, whose staff and voice actors mostly have no TMDB entry at all
 * — searching TMDB alone dead-ended on people AniList knows in full.
 *
 * `pickPersonMatch` judges both legs, fuzzy fallback included: this route shows
 * the user what it found, the distinction plan 0035 R13 draws against a silent
 * deep link. A failing TMDB leg falls through rather than surfacing — one
 * source being down is the case this exists for. Null means neither knew the
 * name.
 */
export function getPersonByName(
  deps: PersonDetailsDeps,
  params: { name: string },
): Effect.Effect<NormalizedPersonDetails | null, ProviderError> {
  const tmdb = deps.tmdb;
  const fromTmdb =
    tmdb == null
      ? Effect.succeed(null)
      : searchPerson(tmdb, { query: params.name }).pipe(
          Effect.flatMap((hits) => {
            const match = pickPersonMatch(hits, params.name);
            return match == null
              ? Effect.succeed(null)
              : getPerson(tmdb, { tmdbId: match.tmdbId });
          }),
          Effect.orElseSucceed(() => null),
        );

  return fromTmdb.pipe(
    Effect.flatMap((details) =>
      details != null
        ? Effect.succeed(details)
        : searchAniListStaff(deps.anilist, { name: params.name }).pipe(
            Effect.flatMap((hits) => {
              const match = pickPersonMatch(hits, params.name);
              return match == null
                ? Effect.succeed(null)
                : getAniListStaff(deps.anilist, { id: match.id });
            }),
            Effect.orElseSucceed(() => null),
          ),
    ),
  );
}
