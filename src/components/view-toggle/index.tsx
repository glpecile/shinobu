import Ionicons from '@react-native-vector-icons/ionicons/static';
import { View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';
import type { ViewToggleProps } from './props';

/** Compact and regular visual frames retain 44pt targets on both segments. */
export function ViewToggle({ view, onChange, size }: ViewToggleProps) {
  const selected = useThemeColor('--color-accent-on-tonal');
  const muted = useThemeColor('--color-muted');

  return (
    <View className="h-11 flex-row items-center px-0.5">
      <View
        className={cn('absolute inset-x-0 rounded-full border border-border', size === 'sm' ? 'top-0.75 h-9.5' : 'inset-y-0')}
        style={{ pointerEvents: 'none' }}
      />
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
          className="w-11 h-11 items-center justify-center rounded-full"
          key={id}
          onPress={() => onChange(id)}
        >
          <View className={cn('w-10 items-center justify-center rounded-full', size === 'sm' ? 'h-8' : 'h-9.5', view === id && 'bg-accent-tonal')}>
            <Ionicons color={view === id ? selected : muted} name={icon} size={size === 'sm' ? 14 : 18} />
          </View>
        </PresstableOpacity>
      ))}
    </View>
  );
}
