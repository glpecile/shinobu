import { HardcoverStatus } from '@/lib/providers/hardcover/reads';
import { STATUS_NAMES } from '@/lib/providers/hardcover/writes';
import { Provider, type ProviderId, type TrackingStatus } from '@/lib/providers/types';
import { useAniListEntryStateQuery } from '@/state/queries/anilist';
import { useHardcoverBookEntryQuery } from '@/state/queries/hardcover';
import { useSerializdTrackingStateQuery } from '@/state/queries/serializd';
import { useSimklLibraryEntryQuery } from '@/state/queries/simkl';
import type { NormalizedMediaItem } from '@/types/media';

const ANILIST_LABELS: Record<string, string> = {
  CURRENT: 'Watching',
  REPEATING: 'Rewatching',
  PAUSED: 'Paused',
  DROPPED: 'Dropped',
  COMPLETED: 'Completed',
  PLANNING: 'Planning',
};

/** A bridged book's AniList entry is its manga's, read rather than watched. */
const ANILIST_READING_LABELS: Record<string, string> = {
  CURRENT: 'Reading',
  REPEATING: 'Rereading',
  COMPLETED: 'Read',
};

const SIMKL_LABELS: Record<string, string> = {
  watching: 'Watching',
  hold: 'Paused',
  dropped: 'Dropped',
  completed: 'Completed',
  plantowatch: 'Plan to watch',
};

const SERIALIZD_LABELS = { watching: 'Watching', watched: 'Watched', completed: 'Completed', paused: 'Paused', dropped: 'Dropped' } as const;

const NOT_TRACKED = 'Not tracked';

/** The statuses a pause or drop moves, the same set the adapters accept. */
type MovableState = 'active' | TrackingStatus;
const ANILIST_STATE: Record<string, MovableState | undefined> = { CURRENT: 'active', PAUSED: 'paused', DROPPED: 'dropped' };
const SIMKL_STATE: Record<string, MovableState | undefined> = { watching: 'active', hold: 'paused', dropped: 'dropped' };
const SERIALIZD_STATE = { watching: 'active', watched: 'active', completed: undefined, paused: 'paused', dropped: 'dropped' } as const;
const HARDCOVER_STATE: Record<number, MovableState | undefined> = {
  [HardcoverStatus.Reading]: 'active',
  [HardcoverStatus.Paused]: 'paused',
  [HardcoverStatus.DidNotFinish]: 'dropped',
};

/**
 * Each target's current status, from the reads the details screen already
 * holds, so providers that disagree show it before the write. A target whose
 * read has not landed has no label. `movable[status]` lists the targets
 * holding an entry that a change to `status` would move: one the adapters
 * accept that is not in that status already.
 */
export function useTrackingState(
  item: NormalizedMediaItem,
  targets: readonly ProviderId[],
): { labels: Partial<Record<ProviderId, string>>; movable: Record<TrackingStatus, ProviderId[]> } {
  const reading = item.type === 'BOOK';
  // A disabled query still returns cached data, and the details screen caches
  // these reads for items that are not targets, such as a film.
  const onAniList = targets.includes(Provider.AniList);
  const onSimkl = targets.includes(Provider.Simkl);
  const onHardcover = targets.includes(Provider.Hardcover);
  const anilistQuery = useAniListEntryStateQuery({
    mediaId: item.externalIds.anilist,
    type: reading ? 'MANGA' : 'ANIME',
    enabled: onAniList,
  });
  const simklQuery = useSimklLibraryEntryQuery({ item, enabled: onSimkl });
  const hardcoverQuery = useHardcoverBookEntryQuery({
    bookId: item.externalIds.hardcover,
    enabled: onHardcover,
  });
  const serializd = useSerializdTrackingStateQuery({
    tmdbId: item.externalIds.tmdb,
    enabled: targets.includes(Provider.Serializd),
  });
  const anilist = onAniList ? anilistQuery.data : undefined;
  const simkl = onSimkl ? simklQuery.data : undefined;
  const hardcover = onHardcover ? hardcoverQuery.data : undefined;

  const labels: Partial<Record<ProviderId, string>> = {};
  const current: Partial<Record<ProviderId, MovableState>> = {
    [Provider.AniList]: ANILIST_STATE[anilist?.entry?.status ?? ''],
    [Provider.Simkl]: SIMKL_STATE[simkl?.status ?? ''],
    [Provider.Hardcover]: HARDCOVER_STATE[hardcover?.statusId ?? 0],
    [Provider.Serializd]: serializd == null ? undefined : SERIALIZD_STATE[serializd],
  };
  const moves = (status: TrackingStatus) =>
    targets.filter((id) => current[id] != null && current[id] !== status);
  const movable = { paused: moves('paused'), dropped: moves('dropped') };
  if (anilist != null) {
    const status = anilist.entry?.status;
    labels[Provider.AniList] = status == null
      ? NOT_TRACKED
      : (reading ? ANILIST_READING_LABELS[status] : undefined) ?? ANILIST_LABELS[status] ?? status;
  }
  if (simkl !== undefined) {
    labels[Provider.Simkl] = simkl == null ? NOT_TRACKED : SIMKL_LABELS[simkl.status];
  }
  if (hardcover !== undefined) {
    labels[Provider.Hardcover] = hardcover == null ? NOT_TRACKED : STATUS_NAMES[hardcover.statusId];
  }
  if (serializd !== undefined) {
    labels[Provider.Serializd] = serializd == null ? NOT_TRACKED : SERIALIZD_LABELS[serializd];
  }
  return { labels, movable };
}
