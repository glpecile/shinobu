import type { ListProps } from '@/components/List';
import type { ReactElement } from 'react';

import type { WatchlistEntry } from '@/features/watchlist/types';
import type { MediaProgress } from '@/lib/media-progress';
import type { NormalizedMediaItem } from '@/types/media';

export interface MediaLayoutProps {
  watched?: (item: NormalizedMediaItem) => MediaProgress | undefined;
  showActions?: boolean;
  itemLayoutAnimation?: ListProps<WatchlistEntry>['itemLayoutAnimation'];
  entries: readonly WatchlistEntry[];
  onItemPress: (item: NormalizedMediaItem) => void;
  onItemActions: (item: NormalizedMediaItem) => void;
  onRefresh: () => Promise<unknown>;
  onEndReached?: (() => void) | undefined;
  footer: ReactElement;
}
