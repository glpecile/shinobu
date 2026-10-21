import type { ListProps } from '@/components/List';
import type { ReactElement } from 'react';

import type { WatchlistEntry } from '@/features/watchlist/types';
import type { MediaProgress } from '@/lib/media-progress';
import type { NormalizedMediaItem } from '@/types/media';

/** Presentation only: screens own data, paging, filtering, and failure states. */
export interface MediaLayoutProps {
  /** Catalogue lists can include films the viewer has already watched; the screen resolves them once. */
  watched?: (item: NormalizedMediaItem) => MediaProgress | undefined;
  showActions?: boolean;
  itemLayoutAnimation?: ListProps<WatchlistEntry>['itemLayoutAnimation'];
  entries: readonly WatchlistEntry[];
  onItemPress: (item: NormalizedMediaItem) => void;
  onItemActions: (item: NormalizedMediaItem) => void;
  refreshing: boolean;
  onRefresh: () => void;
  /** Undefined when there is no further page to request. */
  onEndReached?: (() => void) | undefined;
  /** The screen's loading/retry footer — rendered at the end of the list. */
  footer: ReactElement;
}
