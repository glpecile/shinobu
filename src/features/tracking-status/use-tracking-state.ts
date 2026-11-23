import { HardcoverStatus } from '@/lib/providers/hardcover/reads';
import { Provider, type ProviderId, type TrackingStatus } from '@/lib/providers/types';
import { useAniListEntryStateQuery } from '@/state/queries/anilist';
import { useHardcoverBookEntryQuery } from '@/state/queries/hardcover';
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

const SIMKL_LABELS: Record<string, string> = {
  watching: 'Watching',
  hold: 'Paused',
  dropped: 'Dropped',
  completed: 'Completed',
  plantowatch: 'Plan to watch',
};

const HARDCOVER_LABELS: Record<number, string> = {
  [HardcoverStatus.WantToRead]: 'Want to Read',
  [HardcoverStatus.Reading]: 'Reading',
  [HardcoverStatus.Read]: 'Read',
  [HardcoverStatus.Paused]: 'Paused',
  [HardcoverStatus.DidNotFinish]: 'Did Not Finish',
  [HardcoverStatus.Ignored]: 'Ignored',
};

const NOT_TRACKED = 'Not tracked';

/** The statuses a pause or drop moves, the same set the adapters accept. */
type MovableState = 'active' | TrackingStatus;
const ANILIST_STATE: Record<string, MovableState | undefined> = { CURRENT: 'active', PAUSED: 'paused', DROPPED: 'dropped' };
const SIMKL_STATE: Record<string, MovableState | undefined> = { watching: 'active', hold: 'paused', dropped: 'dropped' };
const HARDCOVER_STATE: Record<number, MovableState | undefined> = {
  [HardcoverStatus.Reading]: 'active',
  [HardcoverStatus.Paused]: 'paused',
  [HardcoverStatus.DidNotFinish]: 'dropped',
};

/**
 * Each target's current status, from the reads the details screen already
 * holds, so providers that disagree show it before the write. A target whose
 * read has not landed has no label. `movable[status]` is whether any target
 * holds an entry that a change to `status` would move: one the adapters
 * accept that is not in that status already.
 */
export function useTrackingState(
  item: NormalizedMediaItem,
  targets: readonly ProviderId[],
): { labels: Partial<Record<ProviderId, string>>; movable: Record<TrackingStatus, boolean> } {
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
  const anilist = onAniList ? anilistQuery.data : undefined;
  const simkl = onSimkl ? simklQuery.data : undefined;
  const hardcover = onHardcover ? hardcoverQuery.data : undefined;

  const labels: Partial<Record<ProviderId, string>> = {};
  const current = [
    ANILIST_STATE[anilist?.entry?.status ?? ''],
    SIMKL_STATE[simkl?.status ?? ''],
    HARDCOVER_STATE[hardcover?.statusId ?? 0],
  ].filter((status) => status != null);
  const movable = {
    paused: current.some((status) => status !== 'paused'),
    dropped: current.some((status) => status !== 'dropped'),
  };
  if (anilist != null) {
    const status = anilist.entry?.status;
    labels[Provider.AniList] = status == null
      ? NOT_TRACKED
      : reading && status === 'CURRENT'
        ? 'Reading'
        : ANILIST_LABELS[status] ?? status;
  }
  if (simkl !== undefined) {
    labels[Provider.Simkl] = simkl == null ? NOT_TRACKED : SIMKL_LABELS[simkl.status];
  }
  if (hardcover !== undefined) {
    labels[Provider.Hardcover] = hardcover == null ? NOT_TRACKED : HARDCOVER_LABELS[hardcover.statusId];
  }
  return { labels, movable };
}
