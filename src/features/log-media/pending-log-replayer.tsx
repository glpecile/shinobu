import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useCatchUpControls } from '@/features/log-media/session/state';
import { toast } from '@/lib/toast';
import { currentUsableProviders } from '@/state/session';
import type { LogMediaResult, LogMediaVariables } from './fan-out';
import { loggedWatch, type LoggedWatch } from './optimistic';
import { pendingLogs, sendablePendingLog } from './pending-logs';
import { useLogMedia } from './use-log-media';

function stoppedLegs(): number {
  return pendingLogs().reduce(
    (count, record) => count + Object.values(record.legs).filter((leg) => leg.state === 'failed').length,
    0,
  );
}

/** One drain at a time in this app. Web tabs share the queue and take the lock below. */
let draining = false;

/**
 * Sends the queue through `log`, oldest first and one record at a time.
 * AniList keeps one progress counter, so episode 5 sent before episode 3
 * would make 3 look logged. A leg that could succeed later stops the drain
 * until the next trigger, which keeps a replay out of a provider's rate limit.
 */
async function drain(
  log: (variables: LogMediaVariables) => Promise<LogMediaResult>,
  trackBusy: (itemId: string, work: Promise<unknown>) => void,
  trackLog: (watch: LoggedWatch | null, work: Promise<unknown>) => void,
): Promise<void> {
  const stoppedBefore = stoppedLegs();
  let logged = 0;
  for (const { id } of pendingLogs()) {
    const sendable = sendablePendingLog(id, currentUsableProviders());
    if (sendable == null) continue;
    const { record, unsent, uncertain } = sendable;
    const write = log({
      ...record.variables,
      providers: [...unsent, ...uncertain],
      // Nobody confirms a replay, so it never becomes a rewatch.
      retryOf: { rewatch: false, unsent },
      replay: id,
    });
    trackBusy(record.variables.item.id, write);
    // The record leaves the queue before its refetch lands. This covers the gap.
    trackLog(loggedWatch(record.variables), write.then((result) => result.settled));
    let result: LogMediaResult;
    try {
      result = await write;
    } catch {
      // A watch-state read failed for now. The record waits as it was.
      break;
    }
    if (result.succeeded.length > 0) logged += 1;
    if (result.outcomes.some((outcome) => outcome.status === 'error' && outcome.transient != null)) break;
  }
  // Only a leg that stopped in this drain: an old one must not toast on every foreground.
  if (stoppedLegs() > stoppedBefore) {
    toast.error('A saved log was not sent', 'Open Pending in your diary.');
  } else if (logged > 0) {
    toast.success('Logged', logged === 1 ? 'Sent 1 saved log.' : `Sent ${logged} saved logs.`);
  }
}

/** Sends the pending queue now, unless a drain already runs or the device is offline. */
export function useDrainPendingLogs(): () => void {
  const { mutateAsync } = useLogMedia();
  const { trackBusy, trackLog } = useCatchUpControls();
  return () => {
    if (draining || !onlineManager.isOnline() || pendingLogs().length === 0) return;
    draining = true;
    const work =
      process.env.EXPO_OS !== 'web'
        ? drain(mutateAsync, trackBusy, trackLog)
        : // Without the Web Locks API two tabs could send one record twice, so nothing is sent.
          (navigator.locks?.request('shinobu-pending-logs', { ifAvailable: true }, (lock) =>
            lock == null ? undefined : drain(mutateAsync, trackBusy, trackLog),
          ) ?? Promise.resolve());
    void work.finally(() => {
      draining = false;
    });
  };
}

/**
 * Mounted once at the app root: sends the pending queue at launch, when the
 * connection returns and when the app comes to the foreground. Renders nothing.
 */
export function PendingLogReplayer(): null {
  const drainNow = useDrainPendingLogs();

  useEffect(() => {
    drainNow();
    const offOnline = onlineManager.subscribe((online) => {
      if (online) drainNow();
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') drainNow();
    });
    return () => {
      offOnline();
      subscription.remove();
    };
  }, [drainNow]);

  return null;
}
