import { createContext } from 'react';

export const SheetCloseContext = createContext<(() => void) | null>(null);
