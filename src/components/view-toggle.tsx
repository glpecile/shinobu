import Ionicons from '@react-native-vector-icons/ionicons/static';
import { View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';
import type { WatchlistView } from '@/state/prefs/watchlist-view';

/** Grid ⇄ list. */
export function ViewToggle({
  view,
  onChange,
}: {
  view: WatchlistView;
  onChange: (view: WatchlistView) => void;
}) {
  const foreground = useThemeColor('--color-foreground');
  const muted = useThemeColor('--color-muted');

  return (
    <View className="flex-row rounded-md border border-border overflow-hidden">
      {(
        [
          { id: 'grid', icon: 'grid', label: 'Poster grid' },
          { id: 'list', icon: 'list', label: 'List' },
        ] as const
      ).map(({ id, icon, label }) => (
        <PresstableOpacity
          accessibilityLabel={label}
          accessibilityRole="button"
          accessibilityState={{ selected: view === id }}
          className={cn('w-9 h-7 items-center justify-center', view === id && 'bg-surface')}
          key={id}
          onPress={() => onChange(id)}
        >
          <Ionicons color={view === id ? foreground : muted} name={icon} size={15} />
        </PresstableOpacity>
      ))}
    </View>
  );
}
