import {
  createContext,
  startTransition,
  useContext,
  useOptimistic,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import type { LogRequest } from '@/features/log-media/log-request';
import { LoggedContext } from '@/features/log-media/logged-context';
import { loggedWatch, type LoggedWatch } from '@/features/log-media/optimistic';
import { usePendingLogs } from '@/features/log-media/pending-logs';
import { haptics } from '@/lib/haptics';

export interface CatchUpSession {
  /** Fresh per opening, so the sheet's chain state never survives a re-open. */
  id: number;
  request: LogRequest;
}

/**
 * App-level quick-log state, mirroring `components/lightbox/state.tsx`: the
 * card's checkmark and the sheet are decoupled. The sheet **must** outlive
 * the card that opened it, even if that trigger disappears or unmounts.
 * Continue Watching uses stable media keys when an episode advances; the
 * root host protects the session independently of any trigger's lifetime.
 * The session is retained after close so late write results still have a
 * home, and replaced wholesale on the next open.
 *
 * `busy` is what the checkmark spins on: any log write or post-write settle
 * still in flight for that item, whichever session started it.
 */
const StateContext = createContext<{
  session: CatchUpSession | null;
  open: boolean;
  busy: ReadonlyMap<string, number>;
}>({ session: null, open: false, busy: new Map() });

const NONE: readonly LoggedWatch[] = [];

const ControlContext = createContext<{
  openCatchUp: (entry: UpNextEpisodeEntry) => void;
  openLog: (request: LogRequest) => void;
  closeCatchUp: () => void;
  /**
   * Holds `itemId` busy until `work` settles, and never rejects the caller.
   * Pass the write, so busy ends with its report. Chain a refetch only of the
   * query the trigger builds its next request from, such as a reading item's
   * progress or Up Next's next episode.
   */
  trackBusy: (itemId: string, work: Promise<unknown>) => void;
  /**
   * Draws `watch` as logged until `work` settles, and never rejects the
   * caller. Pass the write chained to its `settled` refetches, so the real
   * data is in place when the optimistic state ends. A write that fails ends
   * it too, which is the rollback.
   */
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
  // What the screens draw ahead of the providers (`LoggedContext`): the logs
  // still in flight (`trackLog`) and the logs that wait in the pending queue.
  const [inFlight, addInFlight] = useOptimistic(NONE, (current, watch: LoggedWatch) => [...current, watch]);
  // A record with every leg stopped is not logged, so it is not drawn as watched.
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

  // React Compiler memoizes these — no manual useCallback (oxlint-banned).
  const openLog = (request: LogRequest) => {
    haptics.selection();
    const id = (idRef.current += 1);
    setSession({ id, request });
    setOpenId(id);
  };
  const openCatchUp = (entry: UpNextEpisodeEntry) => openLog({
    item: entry.item,
    title: `Log episode ${entry.episode.number}`,
    description: `“${entry.item.title}”`,
    ...(entry.episode.season != null
      ? { episodes: [{ season: entry.episode.season, number: entry.episode.number }] }
      : { entryEpisodes: [entry.episode.number] }),
    entry,
  });
  // A late result belongs to its opening, never a newer sheet.
  const closeCatchUp = () => setOpenId((current) => current === session?.id ? null : current);
  const trackBusy = (itemId: string, work: Promise<unknown>) => {
    bump(itemId, 1);
    void work.then(
      () => bump(itemId, -1),
      () => bump(itemId, -1),
    );
  };

  const trackLog = (watch: LoggedWatch | null, work: Promise<unknown>) => {
    if (watch == null) return;
    // The optimistic state lives exactly as long as this action.
    startTransition(async () => {
      addInFlight(watch);
      await work.catch(() => {});
    });
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

/** Whether a quick-log for `itemId` is being written or settled right now. */
export function useQuickLogBusy(itemId: string): boolean {
  return (useContext(StateContext).busy.get(itemId) ?? 0) > 0;
}
