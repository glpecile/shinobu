import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { episodeCode } from '@/features/episode-details/episode-label';
import { isReadIntent } from '@/features/watchlist-media/copy';
import { WriteResultReport } from '@/features/write-sheet/write-result-report';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { useDrainPendingLogs } from './pending-log-replayer';
import {
  discardPendingLog,
  pendingOutcomes,
  retryPendingLog,
  usePendingLogs,
  type PendingLog,
} from './pending-logs';

/** "S2 E5", "Episode 5", "3 chapters": what the record logs, beside its title. */
function watchLabel({ item, episode, episodes, entryEpisodes }: PendingLog['variables']): string | null {
  const unit = isReadIntent(item) ? 'chapter' : 'episode';
  const seasoned = episodes ?? (episode != null ? [episode] : []);
  const count = seasoned.length + (entryEpisodes?.length ?? 0);
  if (count > 1) return `${count} ${unit}s`;
  if (seasoned.length === 1) return episodeCode(seasoned[0].season, seasoned[0].number);
  if (entryEpisodes?.length === 1) return `${unit === 'chapter' ? 'Chapter' : 'Episode'} ${entryEpisodes[0]}`;
  return null;
}

/**
 * The logs saved on this device and not on a provider yet, behind one button
 * that shows only while some wait. Each record names where it still has to go,
 * and a stopped one keeps its reason, its provider link and a retry.
 */
export function PendingLogs() {
  const records = usePendingLogs();
  const [open, setOpen] = useState(false);
  const drainNow = useDrainPendingLogs();
  // Closed for good once the queue empties, so a later log does not reopen it.
  if (open && records.length === 0) setOpen(false);

  return (
    <>
      {records.length > 0 && (
        <Button
          icon={<Button.Icon name="list-outline" />}
          label={`${records.length} pending`}
          morphLabel
          onPress={() => setOpen(true)}
          size="sm"
          variant="quiet"
        />
      )}
      <Sheet onClose={() => setOpen(false)} open={open}>
        <Sheet.Header>
          <WriteSheet.Title>Pending logs</WriteSheet.Title>
        </Sheet.Header>
        <WriteSheet.Description>
          Saved on this device. Shinobu sends them when you are online. A log that stopped waits for Try again.
        </WriteSheet.Description>
        {/* ponytail: at most MAX_PENDING_LOGS cards in the sheet's scroller. Use List if the cap grows. */}
        {records.map((record) => {
          const label = watchLabel(record.variables);
          const stopped = Object.values(record.legs).some((leg) => leg.state === 'failed');
          return (
            <View className="mt-5 border-t border-border pt-4" key={record.id}>
              <Text className="text-foreground font-sans-semibold text-sm">
                {label == null ? record.variables.item.title : `${record.variables.item.title} · ${label}`}
              </Text>
              <WriteResultReport item={record.variables.item} outcomes={pendingOutcomes(record)} />
              <View className="mt-3 flex-row gap-2">
                {stopped && (
                  <Button
                    icon={<Button.Icon name="refresh" />}
                    label="Try again"
                    onPress={() => {
                      retryPendingLog(record.id);
                      drainNow();
                    }}
                    size="sm"
                    variant="log"
                  />
                )}
                <Button
                  accessibilityLabel={`Discard the saved log of ${record.variables.item.title}`}
                  icon={<Button.Icon name="trash-outline" />}
                  label="Discard"
                  onPress={() => discardPendingLog(record.id)}
                  size="sm"
                  variant="quiet"
                />
              </View>
            </View>
          );
        })}
      </Sheet>
    </>
  );
}
