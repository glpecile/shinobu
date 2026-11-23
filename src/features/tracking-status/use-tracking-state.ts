import { HardcoverStatus } from '@/lib/providers/hardcover/reads';
import { Provider, type ProviderId } from '@/lib/providers/types';
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

/**
 * Each target's current status, from the reads the details screen already
 * holds, so providers that disagree show it before the write. A target whose
 * read has not landed has no label. `changeable` is whether any target holds
 * an entry a pause or drop would move, the same set the adapters accept.
 */
export function useTrackingState(
  item: NormalizedMediaItem,
  targets: readonly ProviderId[],
): { labels: Partial<Record<ProviderId, string>>; changeable: boolean } {
  const reading = item.type === 'BOOK';
  const anilist = useAniListEntryStateQuery({
    mediaId: item.externalIds.anilist,
    type: reading ? 'MANGA' : 'ANIME',
    enabled: targets.includes(Provider.AniList),
  }).data;
  const simkl = useSimklLibraryEntryQuery({ item, enabled: targets.includes(Provider.Simkl) });
  const hardcover = useHardcoverBookEntryQuery({
    bookId: item.externalIds.hardcover,
    enabled: targets.includes(Provider.Hardcover),
  });

  const labels: Partial<Record<ProviderId, string>> = {};
  const changeable =
    ['CURRENT', 'PAUSED', 'DROPPED'].includes(anilist?.entry?.status ?? '') ||
    ['watching', 'hold', 'dropped'].includes(simkl.data?.status ?? '') ||
    ([HardcoverStatus.Reading, HardcoverStatus.Paused, HardcoverStatus.DidNotFinish] as number[]).includes(hardcover.data?.statusId ?? 0);
  if (anilist != null) {
    const status = anilist.entry?.status;
    labels[Provider.AniList] = status == null
      ? NOT_TRACKED
      : reading && status === 'CURRENT'
        ? 'Reading'
        : ANILIST_LABELS[status] ?? status;
  }
  if (simkl.isSuccess) {
    labels[Provider.Simkl] = simkl.data == null ? NOT_TRACKED : SIMKL_LABELS[simkl.data.status];
  }
  if (hardcover.isSuccess) {
    labels[Provider.Hardcover] = hardcover.data == null ? NOT_TRACKED : HARDCOVER_LABELS[hardcover.data.statusId];
  }
  return { labels, changeable };
}
