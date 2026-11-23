import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import { ProviderAuthError, ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import { trackingStatusSkip } from '@/lib/providers/tracking-status';
import { Provider, type TrackingStatus } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';
import { Id, Username } from './watched';

const provider = Provider.Serializd;

const ShowsPage = Schema.Struct({
  items: Schema.Array(Schema.Struct({ showId: Id })),
  totalPages: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9999 })),
});

const LISTS = {
  watching: 'currently_watching_page',
  paused: 'paused_shows_page',
  dropped: 'dropped_shows_page',
} as const;

/** TMDB show ids on each of the account's three status lists. */
export type SerializdTrackingLists = Record<keyof typeof LISTS, number[]>;

/** `watched` is a show with watched seasons that is on none of the lists. */
export type SerializdTrackingState = keyof typeof LISTS | 'watched';

/**
 * The account's Currently Watching, Paused and Dropped lists. Serializd has
 * no per-show status read, so one show's status needs every page of all three
 * (`docs/solutions/tracking-status-provider-support.md`).
 */
export const getSerializdTrackingLists = Effect.fn('serializd.getTrackingLists')(function* (deps: SerializdDeps) {
  const username = deps.session?.username;
  if (!Schema.is(Username)(username)) return yield* new ProviderAuthError({ provider, refreshFailed: true });
  const readList = Effect.fnUntraced(function* (list: string) {
    const readPage = (page: number) =>
      // `sort_by` is mandatory: without it the API answers 500.
      serializdHttp<unknown>(deps, `/user/${encodeURIComponent(username)}/${list}/${page}?sort_by=date_added_desc`, { auth: true }).pipe(
        Effect.flatMap((raw) => Schema.decodeUnknownEffect(ShowsPage)(raw).pipe(
          Effect.mapError(() => new ProviderDecodeError({ provider, detail: `unrecognized ${list}` })),
        )),
      );
    const first = yield* readPage(1);
    const rest = yield* Effect.forEach(
      Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => index + 2),
      readPage,
      { concurrency: 3 },
    );
    return [first, ...rest].flatMap((page) => page.items.map((show) => show.showId));
  });
  return yield* Effect.all(
    { watching: readList(LISTS.watching), paused: readList(LISTS.paused), dropped: readList(LISTS.dropped) },
    { concurrency: 3 },
  );
});

/** A show's status, or null when Serializd holds nothing for it. */
export function serializdTrackingState(
  lists: SerializdTrackingLists,
  tmdbId: number,
  watched: boolean,
): SerializdTrackingState | null {
  if (lists.paused.includes(tmdbId)) return 'paused';
  if (lists.dropped.includes(tmdbId)) return 'dropped';
  if (lists.watching.includes(tmdbId)) return 'watching';
  return watched ? 'watched' : null;
}

const STATE_NAMES: Record<SerializdTrackingState, string> = {
  watching: 'watching',
  watched: 'watched',
  paused: 'paused',
  dropped: 'dropped',
};

/**
 * Pause or drop the show that `current` describes, from a fresh read by the
 * caller. Adding to a status list leaves watched seasons and the watchlist
 * alone. Nothing shows that the server clears the list the show was on, so
 * this removes it there: serializd.com's own client does the same for
 * Currently Watching. A log from Shinobu does not move the show back.
 */
export function setSerializdTrackingStatus(
  deps: SerializdDeps,
  item: NormalizedMediaItem,
  current: SerializdTrackingState | null,
  status: TrackingStatus,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const tmdbId = item.externalIds.tmdb;
  const reason = tmdbId == null
    ? `"${item.title}" has no TMDB id — Serializd needs it as the join key`
    : trackingStatusSkip<SerializdTrackingState>(
        provider,
        current,
        status,
        ['watching', 'watched', 'paused', 'dropped'],
        (name) => STATE_NAMES[name],
      );
  if (reason != null) return Effect.succeed({ status: 'skipped', reason });

  // The response bodies are not captured, so a 2xx with no JSON still counts.
  const post = (path: string) =>
    serializdHttp(deps, path, { method: 'POST', auth: true, body: { show_id: tmdbId } }).pipe(
      Effect.catchTag('ProviderDecodeError', () => Effect.void),
    );
  return Effect.gen(function* () {
    yield* post(`/${status}_shows`);
    switch (current) {
      case 'watching':
        yield* post('/currently_watching/remove');
        break;
      case 'paused':
      case 'dropped':
        yield* post(`/${current}_shows/remove`);
        break;
      default:
        break;
    }
    return { status: 'ok' } satisfies ProviderWriteResult;
  });
}
