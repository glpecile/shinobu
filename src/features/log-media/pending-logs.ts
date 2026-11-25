import { useSyncExternalStore } from 'react';
import { createMMKV, type MMKV } from 'react-native-mmkv';

import { PROVIDERS } from '@/lib/providers/registry';
import { logReadProvesAbsence } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import { providerSessionEpoch } from '@/state/session/tokens';
import type { LogMediaVariables, ProviderWriteOutcome } from './fan-out';

/**
 * Logs that wait for a connection (plan 0116, issue #208). `useLogMedia`
 * queues a log it can't send, and `useDrainPendingLogs` sends the queue again
 * through `useLogMedia`, oldest first. Each record keeps one leg per provider,
 * so a provider that took the log is never sent it twice.
 *
 * Its own MMKV file: the query cache is discarded on a version bump, and the
 * session file holds tokens. This one holds titles, ids and tags.
 */
export type PendingLeg =
  /**
   * `unsent`: no request left the device. `uncertain`: one may have landed,
   * so a fresh read must prove it did not before it is sent again. `epoch` is
   * the session the log was saved under (`providerSessionEpoch`).
   */
  | { state: 'unsent' | 'uncertain'; epoch: number }
  /** Stopped, and shown until the user retries or discards it. `sent` makes a retry `uncertain`. */
  | { state: 'failed'; message: string; sent: boolean };

type WaitingLeg = Extract<PendingLeg, { epoch: number }>;

export interface PendingLog {
  id: string;
  /** Epoch ms when it entered the queue, or was last retried. */
  queuedAt: number;
  /** The user's intent. A replay plans it again, online. */
  variables: Omit<LogMediaVariables, 'providers' | 'retryOf' | 'rewatch' | 'replay'> & { watchedAt: string };
  legs: Partial<Record<ProviderId, PendingLeg>>;
}

/** A log past this is refused with its manual links, never dropped. */
export const MAX_PENDING_LOGS = 50;
/** Older than this, a log is no longer sent without the user: it stops as failed. */
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

const KEY = 'records';
const EMPTY: readonly PendingLog[] = [];
const listeners = new Set<() => void>();
let storage: MMKV | null = null;
let snapshot: readonly PendingLog[] | null = null;

/** Never on the server: MMKV is `localStorage` on web (docs/solutions/expo-web-ssr-mmkv-storage-on-server.md). */
function store(): MMKV | null {
  if (typeof window === 'undefined') return null;
  if (storage == null) {
    storage = createMMKV({ id: 'pending-logs' });
    // Another web tab changed the queue: `save` writes nothing and refreshes this tab's snapshot.
    if (process.env.EXPO_OS === 'web') {
      window.addEventListener('storage', (event) => {
        if (event.key == null || event.key.startsWith('pending-logs')) save(read());
      });
    }
  }
  return storage;
}

/** Reads storage, not the snapshot: another web tab may have changed the queue. */
function read(): PendingLog[] {
  try {
    return JSON.parse(store()?.getString(KEY) ?? '[]') as PendingLog[];
  } catch {
    return [];
  }
}

/** Writes and notifies only on a change, so a drain that changes nothing costs no disk write and no render. */
function save(records: PendingLog[]): void {
  const kept = records.filter((record) => Object.keys(record.legs).length > 0);
  const raw = JSON.stringify(kept);
  if (raw !== (store()?.getString(KEY) ?? '[]')) {
    if (kept.length === 0) store()?.remove(KEY);
    else store()?.set(KEY, raw);
  }
  if (snapshot == null || JSON.stringify(snapshot) !== raw) {
    snapshot = kept;
    for (const listener of listeners) listener();
  }
}

/** The queue, oldest first. */
export function pendingLogs(): readonly PendingLog[] {
  snapshot ??= read();
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingLogs(): readonly PendingLog[] {
  return useSyncExternalStore(subscribe, pendingLogs, () => EMPTY);
}

function update(id: string, change: (record: PendingLog) => PendingLog): void {
  save(read().map((record) => (record.id === id ? change(record) : record)));
}

function legEntries(record: PendingLog): [ProviderId, PendingLeg][] {
  return Object.entries(record.legs) as [ProviderId, PendingLeg][];
}

const episodesOf = (v: LogMediaVariables) => JSON.stringify([v.episode, v.episodes, v.entryEpisodes]);

/** The same watch: one item and one set of episodes or chapters. */
function sameWatch(a: PendingLog['variables'], b: LogMediaVariables): boolean {
  return a.item.id === b.item.id && episodesOf(a) === episodesOf(b);
}

/**
 * Removes the legs of `providers` from records of the same watch, because a
 * new log now owns them. Returns the providers whose removed leg may have
 * landed. The new log must not send those as a rewatch.
 */
export function takePendingLegs(
  variables: LogMediaVariables,
  providers: readonly ProviderId[],
): ProviderId[] {
  const records = read();
  const maybeLanded: ProviderId[] = [];
  let changed = false;
  for (const record of records) {
    if (!sameWatch(record.variables, variables)) continue;
    for (const [provider, leg] of legEntries(record)) {
      if (!providers.includes(provider)) continue;
      if (leg.state === 'uncertain' || (leg.state === 'failed' && leg.sent)) maybeLanded.push(provider);
      delete record.legs[provider];
      changed = true;
    }
  }
  if (changed) save(records);
  return maybeLanded;
}

/**
 * Saves a log to send later, replacing a queued log of the same watch.
 * `state` says whether a request already left the device. False when the
 * queue is full.
 */
export function queuePendingLog(
  variables: LogMediaVariables,
  providers: readonly ProviderId[],
  state: WaitingLeg['state'],
  now = Date.now(),
): boolean {
  const maybeLanded = takePendingLegs(variables, providers);
  const records = read();
  if (records.length >= MAX_PENDING_LOGS) return false;
  const { providers: _providers, retryOf: _retryOf, rewatch: _rewatch, replay: _replay, ...intent } = variables;
  records.push({
    id: `${now}-${Math.random().toString(36).slice(2)}`,
    queuedAt: now,
    // Unset means "now" to every adapter, and a replay runs later.
    variables: { ...intent, watchedAt: variables.watchedAt ?? new Date(now).toISOString() },
    legs: Object.fromEntries(
      providers.map((provider): [ProviderId, PendingLeg] => [
        provider,
        {
          state: maybeLanded.includes(provider) ? 'uncertain' : state,
          epoch: providerSessionEpoch(provider) ?? 0,
        },
      ]),
    ),
  });
  save(records);
  return true;
}

/**
 * Stops every waiting leg that must not be sent: the record is too old, the
 * provider's session ended since the log was saved, or the provider can't be
 * used. Pure, for testing.
 */
export function checkLegs(
  record: PendingLog,
  now: number,
  epochOf: (provider: ProviderId) => number | null,
  usable: readonly ProviderId[],
): PendingLog {
  const legs = Object.fromEntries(
    legEntries(record).map(([provider, leg]): [ProviderId, PendingLeg] => {
      if (leg.state === 'failed') return [provider, leg];
      const { label } = PROVIDERS[provider];
      const message =
        now - record.queuedAt > MAX_AGE_MS
          ? 'It waited more than 7 days for a connection, so it was not sent.'
          : epochOf(provider) !== leg.epoch
            ? `${label} was disconnected or connected again after this log was saved.`
            : !usable.includes(provider)
              ? `${label} must be connected again before it can log.`
              : null;
      return [provider, message == null ? leg : { state: 'failed', message, sent: leg.state === 'uncertain' }];
    }),
  );
  return { ...record, legs };
}

/**
 * The legs of a record to send now, after `checkLegs`. Null when the record
 * is gone or nothing in it waits.
 */
export function sendablePendingLog(
  id: string,
  usable: readonly ProviderId[],
): { record: PendingLog; unsent: ProviderId[]; uncertain: ProviderId[] } | null {
  update(id, (record) => checkLegs(record, Date.now(), providerSessionEpoch, usable));
  const record = pendingLogs().find((candidate) => candidate.id === id);
  if (record == null) return null;
  const waiting = (state: WaitingLeg['state']) =>
    legEntries(record).flatMap(([provider, leg]) => (leg.state === state ? [provider] : []));
  const unsent = waiting('unsent');
  const uncertain = waiting('uncertain');
  return unsent.length + uncertain.length === 0 ? null : { record, unsent, uncertain };
}

/**
 * Marks the legs a replay is about to send `uncertain`, so a process killed
 * during the write leaves a record that is checked before it is sent again.
 * Returns the legs as they were, for `settleReplay`.
 */
export function beginReplay(
  id: string,
  providers: readonly ProviderId[],
): Partial<Record<ProviderId, WaitingLeg>> {
  const prior: Partial<Record<ProviderId, WaitingLeg>> = {};
  update(id, (record) => {
    const legs = { ...record.legs };
    for (const provider of providers) {
      const leg = legs[provider];
      if (leg == null || leg.state === 'failed') continue;
      prior[provider] = leg;
      legs[provider] = { ...leg, state: 'uncertain' };
    }
    return { ...record, legs };
  });
  return prior;
}

/**
 * What one sent leg becomes after its replay round. Undefined removes it: the
 * provider has the log. Pure, for testing.
 */
export function settleLeg(
  provider: ProviderId,
  prior: WaitingLeg,
  outcome: ProviderWriteOutcome | undefined,
): PendingLeg | undefined {
  if (outcome == null) {
    return { state: 'failed', message: `${PROVIDERS[provider].label} has no match for this log.`, sent: false };
  }
  switch (outcome.status) {
    case 'ok':
      return undefined;
    case 'queued':
      return prior;
    case 'skipped':
      // No reason means the provider already records the watch.
      return outcome.reason == null ? undefined : { state: 'failed', message: outcome.reason, sent: false };
    case 'error':
      // A refusal proves nothing landed, so the leg waits as it was.
      if (outcome.transient === 'rate-limit') return prior;
      if (outcome.transient === 'network' && logReadProvesAbsence(provider)) return { ...prior, state: 'uncertain' };
      return {
        state: 'failed',
        message: outcome.message,
        sent: outcome.transient === 'network' || prior.state === 'uncertain',
      };
  }
}

/** Applies a replay round's outcomes to the legs `beginReplay` marked. */
export function settleReplay(
  id: string,
  prior: Partial<Record<ProviderId, WaitingLeg>>,
  outcomes: readonly ProviderWriteOutcome[],
): void {
  update(id, (record) => {
    const legs = { ...record.legs };
    for (const [provider, leg] of Object.entries(prior) as [ProviderId, WaitingLeg][]) {
      const next = settleLeg(provider, leg, outcomes.find((outcome) => outcome.provider === provider));
      if (next == null) delete legs[provider];
      else legs[provider] = next;
    }
    return { ...record, legs };
  });
}

/** Puts a record's failed legs back in the queue, under the sessions connected now. */
export function retryPendingLog(id: string): void {
  update(id, (record) => ({
    ...record,
    queuedAt: Date.now(),
    legs: Object.fromEntries(
      legEntries(record).map(([provider, leg]): [ProviderId, PendingLeg] => [
        provider,
        leg.state === 'failed'
          ? { state: leg.sent ? 'uncertain' : 'unsent', epoch: providerSessionEpoch(provider) ?? 0 }
          : leg,
      ]),
    ),
  }));
}

export function discardPendingLog(id: string): void {
  save(read().filter((record) => record.id !== id));
}

/** A record's legs in the shape the write report renders. */
export function pendingOutcomes(record: PendingLog): ProviderWriteOutcome[] {
  return legEntries(record).map(([provider, leg]) =>
    leg.state === 'failed'
      ? { provider, status: 'error', message: leg.message }
      : { provider, status: 'queued' },
  );
}
