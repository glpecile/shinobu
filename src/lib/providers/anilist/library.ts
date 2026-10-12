import { Clock, Effect, Schema } from 'effect';

import { ProviderDecodeError } from '@/lib/providers/errors';
import type { AniListDeps } from './deps';
import { anilistAuthedRequest } from './http';
import { normalizeAniListListEntry } from './normalize';
import type { NormalizedMediaItem } from '@/types/media';

const Title = Schema.Struct({ english: Schema.NullOr(Schema.String), romaji: Schema.NullOr(Schema.String), native: Schema.NullOr(Schema.String) });
const Entry = Schema.Struct({
  status: Schema.String,
  progress: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  updatedAt: Schema.Int,
  media: Schema.Struct({
    id: Schema.Int,
    idMal: Schema.NullOr(Schema.Int),
    type: Schema.Literals(['ANIME', 'MANGA']),
    format: Schema.NullOr(Schema.String),
    title: Title,
    coverImage: Schema.NullOr(Schema.Struct({ large: Schema.NullOr(Schema.String) })),
    startDate: Schema.Struct({ year: Schema.NullOr(Schema.Int) }),
    episodes: Schema.NullOr(Schema.Int),
    chapters: Schema.NullOr(Schema.Int),
  }),
});
const Collection = Schema.Struct({ lists: Schema.Array(Schema.NullOr(Schema.Struct({ entries: Schema.Array(Schema.NullOr(Entry)) }))) });
const Library = Schema.Struct({ anime: Schema.NullOr(Collection), manga: Schema.NullOr(Collection) });

export interface AniListLibraryEntry {
  item: NormalizedMediaItem;
  status: string;
}

/** All statuses, including completed films; separate from Up Next's narrow current/planned read. */
export const getAniListLibrary = Effect.fn('anilist.getLibrary')(function* (deps: AniListDeps, viewerId: number) {
  const fields = `lists { entries { status progress updatedAt media {
    id idMal type format title { english romaji native } coverImage { large }
    startDate { year } episodes chapters
  } } }`;
  const raw = yield* anilistAuthedRequest<unknown>(deps, `query ($userId: Int) {
    anime: MediaListCollection(userId: $userId, type: ANIME) { ${fields} }
    manga: MediaListCollection(userId: $userId, type: MANGA) { ${fields} }
  }`, { variables: { userId: viewerId } });
  const data = yield* Schema.decodeUnknownEffect(Library)(raw).pipe(
    Effect.mapError(() => new ProviderDecodeError({ provider: 'anilist', detail: 'unrecognized media library' })),
  );
  const now = new Date(yield* Clock.currentTimeMillis).toISOString();
  const entries = [data.anime, data.manga].flatMap((collection) => collection?.lists.flatMap((list) => list?.entries ?? []) ?? []).filter((entry) => entry != null);
  return [...new Map(entries.map((entry) => [entry.media.id, {
    item: normalizeAniListListEntry(entry, now), status: entry.status,
  } satisfies AniListLibraryEntry])).values()];
});
