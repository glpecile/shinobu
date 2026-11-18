import { View } from 'react-native';

import { Button } from '@/components/button';
import { useCatchUpControls, useQuickLogBusy } from '@/features/log-media/session/state';
import { HardcoverStatus } from '@/lib/providers/hardcover/reads';
import { Provider } from '@/lib/providers/types';
import { useAniListEntryStateQuery } from '@/state/queries/anilist';
import { useHardcoverBookEntryQuery } from '@/state/queries/hardcover';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import type { LogRequest } from './log-request';
import { useLogTargetsSplit } from './use-log-targets';

/**
 * A book's log button (plan 0117 B3). It reads the book's Hardcover library
 * entry and opens the one-shot log form on the likely log: the page reached
 * for a book in progress, the whole book otherwise. The form can change it.
 * A volume bridged to AniList (B5) opens finished once AniList counts it,
 * and otherwise notes AniList's chapter, which never becomes a page (KTD-3).
 */
export function LogBookButton({ item, onOpenRequest }: { item: NormalizedMediaItem; onOpenRequest?: (request: LogRequest) => void }) {
  const connected = useConnectedProviders();
  const { openLog } = useCatchUpControls();
  const busy = useQuickLogBusy(item.id);
  const { writable: targets, manual: manualTargets, enriched } = useLogTargetsSplit(item);
  const entry = useHardcoverBookEntryQuery({
    bookId: item.externalIds.hardcover,
    enabled: connected.includes(Provider.Hardcover),
  });
  const volume = enriched?.anilistVolume;
  const anilist = useAniListEntryStateQuery({
    mediaId: volume == null ? undefined : enriched?.externalIds.anilist,
    type: 'MANGA',
    enabled: connected.includes(Provider.AniList),
  });
  if (targets.length === 0 && manualTargets.length === 0) return null;

  // A Paused or Did Not Finish book resumes at its page. A Read book's open
  // read is an import with no end date, not a read in progress.
  const reread = entry.data?.statusId === HardcoverStatus.Read;
  const openRead = reread ? null : (entry.data?.openRead ?? null);
  // 0 pages is an unknown count, not a cap of 0.
  const total = entry.data?.pages || item.totalEpisodes || undefined;
  const action = openRead != null ? 'Log progress' : reread ? 'Reread' : 'Mark as read';
  // A search card knows nothing of the library. Without the entry, a log
  // could start a second read of a book that is in progress.
  // The form opens on what both trackers know, so it waits for the AniList
  // bridge too. A failed AniList read only loses the note.
  const bridgeKnown = !connected.includes(Provider.AniList) || enriched !== undefined;
  const hardcoverKnown = !connected.includes(Provider.Hardcover) || entry.data !== undefined;
  const known = hardcoverKnown && bridgeKnown && (volume == null || anilist.data !== undefined || anilist.isError);
  const failed = entry.data === undefined && entry.isError;
  const anilistEntry = anilist.data?.entry ?? null;
  const anilistHasVolume = volume != null && anilistEntry != null && anilistEntry.progressVolumes >= volume;
  const anilistTotal = anilist.data?.total;
  const anilistNote =
    volume != null && !anilistHasVolume && anilistEntry != null && anilistEntry.progress > 0
      ? ` · AniList: chapter ${anilistEntry.progress}${anilistTotal != null ? ` of ${anilistTotal}` : ''}`
      : '';

  return (
    <View className="mb-3">
      <Button
        variant="log"
        disabled={!known && !failed}
        icon={<Button.Icon name={failed ? 'refresh' : reread ? 'eye' : 'eye-outline'} />}
        label={failed ? 'Couldn’t load your progress' : action}
        // A background refetch keeps the label. `busy` covers the refetch a
        // log starts, which the confirm sheet tracks with the write.
        loading={(!known && !failed && (entry.isFetching || anilist.isFetching || !bridgeKnown)) || busy}
        onPress={() => {
          if (failed) {
            void entry.refetch();
            return;
          }
          const request: LogRequest = {
            item,
            title: action,
            description: reread
              ? `You’ve read “${item.title}” — this logs another read.`
              : `“${item.title}”${anilistNote}`,
            reading: {
              // An open read past the page count shows as finished, so it logs as one.
              finished: openRead == null || anilistHasVolume || (total != null && openRead.progressPages >= total),
              page: openRead?.progressPages ?? 0,
              ...(total != null ? { total } : {}),
              ...(reread ? { reread: true } : {}),
            },
          };
          if (onOpenRequest != null) {
            onOpenRequest(request);
            return;
          }
          openLog(request);
        }}
      />
    </View>
  );
}
