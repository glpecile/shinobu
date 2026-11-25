import { createContext, useContext } from 'react';

import type { LoggedWatch } from './optimistic';

/**
 * The logs to draw ahead of the providers, set by `CatchUpLogProvider`
 * (`session/state.tsx`). Its own module, so a screen that only reads it does
 * not import the log session.
 */
export const LoggedContext = createContext<readonly LoggedWatch[]>([]);

export function useLoggedWatches(): readonly LoggedWatch[] {
  return useContext(LoggedContext);
}
