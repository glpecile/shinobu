import { useMutation, useMutationState } from '@tanstack/react-query';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import type { LogRequest } from '@/features/log-media/log-request';
import { LoggedContext } from '@/features/log-media/logged-context';
import { loggedWatch, type LoggedWatch } from '@/features/log-media/optimistic';
import { usePendingLogs } from '@/features/log-media/pending-logs';
import { haptics } from '@/lib/haptics';

export interface CatchUpSession {
  id: number;
  request: LogRequest;
}

const StateContext = createContext<{
  session: CatchUpSession | null;
  open: boolean;
  busy: ReadonlyMap<string, number>;
}>({ session: null, open: false, busy: new Map() });

const NONE: readonly LoggedWatch[] = [];

/**
 * One mutation per tracked log, so each log's optimistic state ends with its
 * own work. Not `useOptimistic`: React 19 joins concurrent async transitions,
 * so a log would end only when every log in flight settles
 * (docs/solutions/react-async-transitions-are-entangled.md).
 */
const LOGGED_WATCH_KEY = ['logged-watch'] as const;

interface HeldWatch {
  watch: LoggedWatch;
  work: Promise<unknown>;
}

const ControlContext = createContext<{
  openCatchUp: (entry: UpNextEpisodeEntry) => void;
  openLog: (request: LogRequest) => void;
  closeCatchUp: () => void;
  trackBusy: (itemId: string, work: Promise<unknown>) => void;
  trackLog: (watch: LoggedWatch | null, work: Promise<unknown>) => void;
}>({
  openCatchUp: () => {},
  openLog: () => {},
  closeCatchUp: () => {},
  trackBusy: () => {},
  trackLog: () => {},
});

export function CatchUpLogProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CatchUpSession | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const open = session != null && openId === session.id;
  const [busy, setBusy] = useState<ReadonlyMap<string, number>>(new Map());
  const idRef = useRef(0);
  const { mutate: holdWatch } = useMutation({
    mutationKey: LOGGED_WATCH_KEY,
    mutationFn: ({ work }: HeldWatch) => work,
  });
  const inFlight = useMutationState({
    filters: { mutationKey: LOGGED_WATCH_KEY, status: 'pending' },
    select: (mutation) => (mutation.state.variables as HeldWatch).watch,
  });
  const queued = usePendingLogs().flatMap((record) =>
    Object.values(record.legs).some((leg) => leg.state !== 'failed')
      ? (loggedWatch(record.variables) ?? [])
      : [],
  );
  const logged = inFlight.length + queued.length === 0 ? NONE : [...inFlight, ...queued];

  const bump = (itemId: string, delta: number) =>
    setBusy((current) => {
      const next = new Map(current);
      const count = (next.get(itemId) ?? 0) + delta;
      if (count <= 0) next.delete(itemId);
      else next.set(itemId, count);
      return next;
    });

  const openLog = (request: LogRequest) => {
    haptics.selection();
    const id = (idRef.current += 1);
    setSession({ id, request });
    setOpenId(id);
  };
  const openCatchUp = (entry: UpNextEpisodeEntry) =>
    openLog({
      item: entry.item,
      title: `Log episode ${entry.episode.number}`,
      description: `“${entry.item.title}”`,
      ...(entry.episode.season != null
        ? { episodes: [{ season: entry.episode.season, number: entry.episode.number }] }
        : { entryEpisodes: [entry.episode.number] }),
      entry,
    });
  const closeCatchUp = () => setOpenId((current) => (current === session?.id ? null : current));
  const trackBusy = (itemId: string, work: Promise<unknown>) => {
    bump(itemId, 1);
    void work.then(
      () => bump(itemId, -1),
      () => bump(itemId, -1),
    );
  };

  const trackLog = (watch: LoggedWatch | null, work: Promise<unknown>) => {
    if (watch != null) holdWatch({ watch, work });
  };

  return (
    <StateContext.Provider value={{ session, open, busy }}>
      <ControlContext.Provider value={{ openLog, openCatchUp, closeCatchUp, trackBusy, trackLog }}>
        <LoggedContext.Provider value={logged}>{children}</LoggedContext.Provider>
      </ControlContext.Provider>
    </StateContext.Provider>
  );
}

export function useCatchUpLog() {
  return useContext(StateContext);
}

export function useCatchUpControls() {
  return useContext(ControlContext);
}

export function useQuickLogBusy(itemId: string): boolean {
  return (useContext(StateContext).busy.get(itemId) ?? 0) > 0;
}
