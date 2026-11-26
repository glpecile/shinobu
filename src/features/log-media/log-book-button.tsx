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

export function LogBookButton({
  item,
  onOpenRequest,
}: {
  item: NormalizedMediaItem;
  onOpenRequest?: (request: LogRequest) => void;
}) {
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

  // Hardcover Read books can have an imported openRead with no end date, not a read in progress.
  const reread = entry.data?.statusId === HardcoverStatus.Read;
  const openRead = reread ? null : (entry.data?.openRead ?? null);
  const total = entry.data?.pages || item.totalEpisodes || undefined;
  const action = openRead != null ? 'Log progress' : reread ? 'Reread' : 'Mark as read';
  const bridgeKnown = enriched !== undefined;
  const hardcoverKnown = !connected.includes(Provider.Hardcover) || entry.data !== undefined;
  const known =
    hardcoverKnown &&
    bridgeKnown &&
    (volume == null || anilist.data !== undefined || anilist.isError);
  const failed = entry.data === undefined && entry.isError;
  const waiting = !known && !failed;
  const anilistEntry = anilist.data?.entry ?? null;
  const anilistHasVolume =
    volume != null && anilistEntry != null && anilistEntry.progressVolumes >= volume;
  const anilistTotal = anilist.data?.total;
  const anilistNote =
    volume != null && !anilistHasVolume && anilistEntry != null && anilistEntry.progress > 0
      ? ` · AniList: chapter ${anilistEntry.progress}${anilistTotal != null ? ` of ${anilistTotal}` : ''}`
      : '';

  return (
    <View className="mb-3">
      <Button
        variant="log"
        disabled={waiting}
        icon={<Button.Icon name={failed ? 'refresh' : reread ? 'eye' : 'eye-outline'} />}
        label={failed ? 'Couldn’t load your progress' : action}
        loading={(failed ? entry.isFetching : waiting) || busy}
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
              finished:
                openRead == null ||
                anilistHasVolume ||
                (total != null && openRead.progressPages >= total),
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
