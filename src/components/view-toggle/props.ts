import type { WatchlistView } from '@/state/prefs/watchlist-view';

export interface ViewToggleProps {
  view: WatchlistView;
  onChange: (view: WatchlistView) => void;
  size: 'sm' | 'md';
}
