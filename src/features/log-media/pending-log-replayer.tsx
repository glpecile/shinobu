import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useCatchUpControls } from '@/features/log-media/session/state';
import type { ProviderId } from '@/lib/providers/types';
import { toast } from '@/lib/toast';
import { currentUsableProviders } from '@/state/session';
import type { LogMediaResult, LogMediaVariables } from './fan-out';
import { loggedWatch, type LoggedWatch } from './optimistic';
import { pendingLogs, sendablePendingLog, subscribePendingLogs } from './pending-logs';
import { useLogMedia } from './use-log-media';

const legs = () => pendingLogs().flatMap((record) => Object.values(record.legs));
const stoppedLegs = () => legs().filter((leg) => leg.state === 'failed').length;

const RETRY_MS = 60_000;
const MAX_RETRY_MS = 15 * 60_000;

let draining = false;

/** Sequential oldest-first: AniList tracks a single progress counter, so sending episode 5 before 3 would make 3 look logged. */
async function drain(
  log: (variables: LogMediaVariables) => Promise<LogMediaResult>,
  trackBusy: (itemId: string, work: Promise<unknown>) => void,
  trackLog: (watch: LoggedWatch | null, work: Promise<unknown>) => void,
): Promise<void> {
  const stoppedBefore = stoppedLegs();
  let logged = 0;
  const held = new Set<ProviderId>();
  for (const { id } of pendingLogs()) {
    const sendable = sendablePendingLog(id, currentUsableProviders());
    if (sendable == null) continue;
    const { record } = sendable;
    const unsent = sendable.unsent.filter((provider) => !held.has(provider));
    const uncertain = sendable.uncertain.filter((provider) => !held.has(provider));
    if (unsent.length + uncertain.length === 0) continue;
    const write = log({
      ...record.variables,
      providers: [...unsent, ...uncertain],
      retryOf: { rewatch: false, unsent, unanswered: uncertain },
      replay: id,
    });
    trackBusy(record.variables.item.id, write);
    trackLog(
      loggedWatch(record.variables),
      write.then((result) => result.settled),
    );
    let result: LogMediaResult;
    try {
      result = await write;
    } catch {
      break;
    }
    if (result.succeeded.length > 0) logged += 1;
    for (const outcome of result.outcomes) {
      if (outcome.status === 'error' && outcome.transient != null) held.add(outcome.provider);
    }
  }
  if (stoppedLegs() > stoppedBefore) {
    toast.error('Not every saved log was sent', 'Open Pending logs in your diary.');
  } else if (logged > 0) {
    toast.success('Logged', logged === 1 ? 'Sent 1 saved log.' : `Sent ${logged} saved logs.`);
  }
}

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

export function PendingLogReplayer(): null {
  const drainNow = useDrainPendingLogs();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = RETRY_MS;
    const retryLater = () => {
      if (legs().every((leg) => leg.state === 'failed')) {
        clearTimeout(timer);
        timer = undefined;
        delay = RETRY_MS;
        return;
      }
      if (timer != null) return;
      timer = setTimeout(() => {
        timer = undefined;
        drainNow();
        retryLater();
      }, delay);
      delay = Math.min(delay * 2, MAX_RETRY_MS);
    };

    drainNow();
    retryLater();
    const offQueue = subscribePendingLogs(retryLater);
    const offOnline = onlineManager.subscribe((online) => {
      if (online) drainNow();
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') drainNow();
    });
    return () => {
      clearTimeout(timer);
      offQueue();
      offOnline();
      subscription.remove();
    };
  }, [drainNow]);

  return null;
}
