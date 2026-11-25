import { useSyncExternalStore } from 'react';
import { createMMKV, type MMKV } from 'react-native-mmkv';

import { PROVIDERS } from '@/lib/providers/registry';
import { logReadProvesAbsence } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import { providerSessionEpoch } from '@/state/session/tokens';
import type { LogMediaVariables, ProviderWriteOutcome } from './fan-out';

/** An uncertain leg can replay only after a fresh read proves the write missed. */
export type PendingLeg =
  | { state: 'unsent' | 'uncertain'; epoch: number }
  | { state: 'failed'; message: string; sent: boolean };

type WaitingLeg = Extract<PendingLeg, { epoch: number }>;

export interface PendingLog {
  id: string;
  /** Epoch ms when queued or last retried. */
  queuedAt: number;
  variables: Omit<LogMediaVariables, 'providers' | 'retryOf' | 'rewatch' | 'replay'> & { watchedAt: string };
  legs: Partial<Record<ProviderId, PendingLeg>>;
}

export const MAX_PENDING_LOGS = 50;
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
    if (process.env.EXPO_OS === 'web') {
      window.addEventListener('storage', (event) => {
        if (event.key == null || event.key.startsWith('pending-logs')) save(read());
      });
    }
  }
  return storage;
}

function read(): PendingLog[] {
  try {
    return JSON.parse(store()?.getString(KEY) ?? '[]') as PendingLog[];
  } catch {
    return [];
  }
}

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

export function pendingLogs(): readonly PendingLog[] {
  snapshot ??= read();
  return snapshot;
}

export function subscribePendingLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingLogs(): readonly PendingLog[] {
  return useSyncExternalStore(subscribePendingLogs, pendingLogs, () => EMPTY);
}

function update(id: string, change: (record: PendingLog) => PendingLog): void {
  save(read().map((record) => (record.id === id ? change(record) : record)));
}

function legEntries(record: PendingLog): [ProviderId, PendingLeg][] {
  return Object.entries(record.legs) as [ProviderId, PendingLeg][];
}

const episodesOf = (v: LogMediaVariables) => JSON.stringify([v.episode, v.episodes, v.entryEpisodes]);

function sameWatch(a: PendingLog['variables'], b: LogMediaVariables): boolean {
  return a.item.id === b.item.id && episodesOf(a) === episodesOf(b);
}

/** Returns the removed providers whose writes may have landed. Never rewatch those. */
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
    // Capture the original watch time. An unset timestamp would become the replay time.
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

/** Persist uncertainty before sending so a crash forces a check on the next replay. */
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
      return outcome.reason == null ? undefined : { state: 'failed', message: outcome.reason, sent: false };
    case 'error':
      if (outcome.transient === 'rate-limit') return prior;
      if (outcome.transient === 'network' && logReadProvesAbsence(provider)) return { ...prior, state: 'uncertain' };
      return {
        state: 'failed',
        message: outcome.message,
        sent: outcome.transient === 'network' || prior.state === 'uncertain',
      };
  }
}

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

export function pendingOutcomes(record: PendingLog): ProviderWriteOutcome[] {
  return legEntries(record).map(([provider, leg]) =>
    leg.state === 'failed'
      ? { provider, status: 'error', message: leg.message }
      : { provider, status: 'queued' },
  );
}
