import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { useThemeColor } from '@/lib/theme-color';

/**
 * The role picker behind the filmography's role button: every department
 * the person holds under the current format, with its title count, in the
 * app's bottom sheet (the seasons explorer's year jump, for roles). One
 * control on the page instead of a strip of chips competing with the pill.
 */
export function RoleSheet({
  open,
  onClose,
  roles,
  value,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  roles: readonly { role: string; count: number }[];
  /** Null is every role. */
  value: string | null;
  onSelect: (role: string | null) => void;
}) {
  const foreground = useThemeColor('--color-foreground');
  const options = [
    {
      role: null,
      label: 'All roles',
      count: roles.reduce((sum, entry) => sum + entry.count, 0),
    },
    ...roles.map((entry) => ({
      role: entry.role,
      label: entry.role,
      count: entry.count,
    })),
  ];

  return (
    <Sheet onClose={onClose} open={open}>
      <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-1">
        Role
      </Text>
      {options.map((option) => {
        const selected = option.role === value;
        return (
          <PresstableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className="flex-row items-center gap-3 py-3"
            key={option.label}
            onPress={() => {
              haptics.selection();
              onSelect(option.role);
              onClose();
            }}
          >
            <Text
              className={cn(
                'flex-1 font-sans text-base text-foreground',
                selected && 'font-sans-semibold',
              )}
            >
              {option.label}
            </Text>
            <Text className="text-muted font-sans text-sm">{option.count}</Text>
            {/* A fixed slot, so the counts line up whether or not a row is checked. */}
            <View className="w-5 items-end">
              {selected && <Ionicons color={foreground} name="checkmark" size={18} />}
            </View>
          </PresstableOpacity>
        );
      })}
    </Sheet>
  );
}
