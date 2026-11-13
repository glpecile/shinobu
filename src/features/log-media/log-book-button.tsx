import { View } from 'react-native';

import { Button } from '@/components/button';
import { useCatchUpControls, useQuickLogBusy } from '@/features/log-media/session/state';
import { HardcoverStatus } from '@/lib/providers/hardcover/reads';
import { Provider } from '@/lib/providers/types';
import { useHardcoverBookEntryQuery } from '@/state/queries/hardcover';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import type { LogRequest } from './log-request';
import { useLogTargetsSplit } from './use-log-targets';

/**
 * A book's log button (plan 0117 B3). It reads the book's Hardcover library
 * entry and opens the one-shot log form on the likely log: the page reached
 * for a book in progress, the whole book otherwise. The form can change it.
 */
export function LogBookButton({ item, onOpenRequest }: { item: NormalizedMediaItem; onOpenRequest?: (request: LogRequest) => void }) {
  const connected = useConnectedProviders();
  const { openLog } = useCatchUpControls();
  const busy = useQuickLogBusy(item.id);
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  const entry = useHardcoverBookEntryQuery({
    bookId: item.externalIds.hardcover,
    enabled: connected.includes(Provider.Hardcover),
  });
  if (targets.length === 0 && manualTargets.length === 0) return null;

  // A Paused or Did Not Finish book resumes at its page. A Read book's open
  // read is an import with no end date, not a read in progress.
  const reread = entry.data?.statusId === HardcoverStatus.Read;
  const openRead = reread ? null : (entry.data?.openRead ?? null);
  const total = entry.data?.pages ?? item.totalEpisodes;
  const action = openRead != null ? 'Log progress' : reread ? 'Reread' : 'Mark as read';
  // A search card knows nothing of the library. Without the entry, a log
  // could start a second read of a book that is in progress.
  const known = entry.data !== undefined;
  const failed = !known && entry.isError;

  return (
    <View className="mb-3">
      <Button
        variant="log"
        disabled={!known && !failed}
        icon={<Button.Icon name={failed ? 'refresh' : reread ? 'eye' : 'eye-outline'} />}
        label={failed ? 'Couldn’t load your progress' : action}
        // A background refetch keeps the label. `busy` covers the refetch a
        // log starts, which the confirm sheet tracks with the write.
        loading={(!known && entry.isFetching) || busy}
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
              : `“${item.title}”`,
            reading: {
              finished: openRead == null,
              page: openRead?.progressPages ?? 0,
              // An edition with 0 pages has no known count, not a cap of 0.
              ...(total != null && total > 0 ? { total } : {}),
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
