import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { UpNextEpisodeEntry } from '@/features/up-next/types';

export interface CatchUpSession {
  /** Fresh per opening, so the sheet's chain state never survives a re-open. */
  id: number;
  entry: UpNextEpisodeEntry;
}

/**
 * App-level quick-log state, mirroring `components/lightbox/state.tsx`: the
 * card's checkmark and the sheet are decoupled. The sheet **must** outlive
 * the card that opened it — a logged episode re-keys the Continue Watching
 * row (its entry id carries the episode number), which unmounts the card and
 * would take a card-owned sheet with it mid-chain (plan 0037 KTD-1). The
 * session is retained after close so late write results still have a home,
 * and replaced wholesale on the next open.
 *
 * `busy` is what the checkmark spins on: any log write or post-write settle
 * still in flight for that item, whichever session started it.
 */
const StateContext = createContext<{
  session: CatchUpSession | null;
  open: boolean;
  busy: ReadonlyMap<string, number>;
}>({ session: null, open: false, busy: new Map() });

const ControlContext = createContext<{
  openCatchUp: (entry: UpNextEpisodeEntry) => void;
  closeCatchUp: () => void;
  /** Hold `itemId` busy until `work` settles (never rejects the caller). */
  trackBusy: (itemId: string, work: Promise<unknown>) => void;
}>({
  openCatchUp: () => {},
  closeCatchUp: () => {},
  trackBusy: () => {},
});

export function CatchUpLogProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CatchUpSession | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ReadonlyMap<string, number>>(new Map());
  const idRef = useRef(0);

  const bump = (itemId: string, delta: number) =>
    setBusy((current) => {
      const next = new Map(current);
      const count = (next.get(itemId) ?? 0) + delta;
      if (count <= 0) next.delete(itemId);
      else next.set(itemId, count);
      return next;
    });

  // React Compiler memoizes these — no manual useCallback (oxlint-banned).
  const openCatchUp = (entry: UpNextEpisodeEntry) => {
    setSession({ id: (idRef.current += 1), entry });
    setOpen(true);
  };
  const closeCatchUp = () => setOpen(false);
  const trackBusy = (itemId: string, work: Promise<unknown>) => {
    bump(itemId, 1);
    void work.then(
      () => bump(itemId, -1),
      () => bump(itemId, -1),
    );
  };

  return (
    <StateContext.Provider value={{ session, open, busy }}>
      <ControlContext.Provider value={{ openCatchUp, closeCatchUp, trackBusy }}>
        {children}
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
