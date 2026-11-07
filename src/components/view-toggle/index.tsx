import Ionicons from '@react-native-vector-icons/ionicons/static';
import { View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';
import type { WatchlistView } from '@/state/prefs/watchlist-view';

/**
 * Grid ⇄ list for web, on `SegmentedControl`'s `md` frame (a `p-0.5` pill,
 * 44pt touch targets. Native
 * platforms use their own controls.
 */
export function ViewToggle({
  view,
  onChange,
}: {
  view: WatchlistView;
  onChange: (view: WatchlistView) => void;
}) {
  const selected = useThemeColor('--color-accent-on-tonal');
  const muted = useThemeColor('--color-muted');

  return (
    <View className="flex-row rounded-full border border-border p-0.5">
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
          className={cn('w-11 h-11 items-center justify-center rounded-full', view === id && 'bg-accent-tonal')}
          key={id}
          onPress={() => onChange(id)}
        >
          <Ionicons color={view === id ? selected : muted} name={icon} size={16} />
        </PresstableOpacity>
      ))}
    </View>
  );
}
