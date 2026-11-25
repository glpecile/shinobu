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

/** The first wait before a drain that no event starts. It doubles up to the maximum while legs still wait. */
const RETRY_MS = 60_000;
const MAX_RETRY_MS = 15 * 60_000;

/** One drain at a time in this app. Web tabs share the queue and take the lock below. */
let draining = false;

/**
 * Sends the queue through `log`, oldest first and one record at a time.
 * AniList keeps one progress counter, so episode 5 sent before episode 3
 * would make 3 look logged. A leg that could succeed later holds its
 * provider's later legs until the next drain, which keeps the order and keeps
 * a replay out of that provider's rate limit. The other providers go on.
 */
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
      // Nobody confirms a replay, so it never becomes a rewatch.
      retryOf: { rewatch: false, unsent, unanswered: uncertain },
      replay: id,
    });
    trackBusy(record.variables.item.id, write);
    // The record leaves the queue before its refetch lands. This covers the gap.
    trackLog(loggedWatch(record.variables), write.then((result) => result.settled));
    let result: LogMediaResult;
    try {
      result = await write;
    } catch {
      // The plan itself failed for now, before any provider was asked. Every record waits as it was.
      break;
    }
    if (result.succeeded.length > 0) logged += 1;
    for (const outcome of result.outcomes) {
      if (outcome.status === 'error' && outcome.transient != null) held.add(outcome.provider);
    }
  }
  // Only a leg that stopped in this drain: an old one must not toast on every foreground.
  if (stoppedLegs() > stoppedBefore) {
    toast.error('Not every saved log was sent', 'Open Pending logs in your diary.');
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
 * connection returns and when the app comes to the foreground. While a leg
 * still waits it also sends on a timer, because a log that got no answer on a
 * device that reports a connection has no event to wait for. Renders nothing.
 */
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
