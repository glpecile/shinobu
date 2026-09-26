import { Host, Icon, IconButton } from '@expo/ui/jetpack-compose';

import { useThemeColor } from '@/lib/theme-color';
import type { WatchlistView } from '@/state/prefs/watchlist-view';

/** A compact native action showing the layout it switches to. */
export function ViewToggle({
  view,
  onChange,
}: {
  view: WatchlistView;
  onChange: (view: WatchlistView) => void;
}) {
  const foreground = useThemeColor('--color-foreground');
  const next = view === 'grid' ? 'list' : 'grid';

  return (
    <Host matchContents>
      <IconButton
        colors={{ contentColor: foreground }}
        onClick={() => onChange(next)}
      >
        <Icon
          contentDescription={next === 'grid' ? 'Switch to poster grid' : 'Switch to list'}
          size={22}
          source={next === 'grid' ? require('./grid-view.xml') : require('./view-list.xml')}
        />
      </IconButton>
    </Host>
  );
}
