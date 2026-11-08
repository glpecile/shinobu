import type { WatchlistView } from '@/state/prefs/watchlist-view';

export interface ViewToggleProps {
  view: WatchlistView;
  onChange: (view: WatchlistView) => void;
  /** Match compact toolbar buttons (sm) or full-size controls (md). */
  size: 'sm' | 'md';
}
