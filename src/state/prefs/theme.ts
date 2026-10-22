import { useSyncExternalStore } from 'react';
import { Uniwind } from 'uniwind';

import { isServer, prefsStorage } from './storage';

/** Follow the OS appearance, or pin one. Persisted on device. */
export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'theme';

function readThemePreference(): ThemePreference {
  if (isServer()) return 'system';
  const stored = prefsStorage.getString(KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/** Applies the stored preference; call once at module scope before first render. */
export function applyThemePreference(): void {
  if (!isServer()) Uniwind.setTheme(readThemePreference());
}

export function setThemePreference(theme: ThemePreference): void {
  prefsStorage.set(KEY, theme);
  Uniwind.setTheme(theme);
  // Browser-painted surfaces (scrollbars, form controls) follow `color-scheme`,
  // which +html.tsx pins at boot for a stored light or dark.
  if (process.env.EXPO_OS === 'web') {
    document.documentElement.style.colorScheme = theme === 'system' ? '' : theme;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener(onStoreChange);
  return () => subscription.remove();
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readThemePreference, () => 'system' as const);
}
