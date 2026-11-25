import { createContext, useContext } from 'react';

import type { LoggedWatch } from './optimistic';

export const LoggedContext = createContext<readonly LoggedWatch[]>([]);

export function useLoggedWatches(): readonly LoggedWatch[] {
  return useContext(LoggedContext);
}
