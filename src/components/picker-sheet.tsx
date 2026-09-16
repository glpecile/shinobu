import Ionicons from '@react-native-vector-icons/ionicons/static';
import { createContext, type ReactNode, useContext } from 'react';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { useThemeColor } from '@/lib/theme-color';

type PickerValue = string | number | null;

const PickerContext = createContext<{
  value: PickerValue;
  select: (value: PickerValue) => void;
}>({ value: null, select: () => {} });

/**
 * Single-choice list in the app's bottom sheet: a titled column of options,
 * each with an optional leading icon and a trailing count, the chosen one
 * checked. Picking selects and closes.
 *
 * ```tsx
 * <PickerSheet onClose={close} onSelect={setRole} open={open} title="Role" value={role}>
 *   <PickerSheet.Option count={208} label="All roles" value={null} />
 *   <PickerSheet.Option count={171} label="Acting" value="Acting" />
 * </PickerSheet>
 * ```
 */
export function PickerSheet<T extends PickerValue>({
  open,
  onClose,
  title,
  value,
  onSelect,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  value: T;
  onSelect: (value: T) => void;
  children: ReactNode;
}) {
  function select(next: PickerValue) {
    haptics.selection();
    onClose();
    onSelect(next as T);
  }

  return (
    <Sheet onClose={onClose} open={open}>
      <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-1">
        {title}
      </Text>
      <PickerContext.Provider value={{ value, select }}>{children}</PickerContext.Provider>
    </Sheet>
  );
}

function PickerOption({
  value,
  label,
  count,
  icon,
  accessibilityLabel,
}: {
  value: PickerValue;
  label: string;
  count?: string | number;
  icon?: ReactNode;
  accessibilityLabel?: string;
}) {
  const picker = useContext(PickerContext);
  const foreground = useThemeColor('--color-foreground');
  const selected = picker.value === value;

  return (
    <PresstableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-row items-center gap-3 py-3"
      onPress={() => picker.select(value)}
    >
      {icon}
      <Text
        className={cn(
          'flex-1 font-sans text-base text-foreground',
          selected && 'font-sans-semibold',
        )}
      >
        {label}
      </Text>
      {count != null && <Text className="text-muted font-sans text-sm">{count}</Text>}
      {/* A fixed slot, so the counts line up whether or not a row is checked. */}
      <View className="w-5 items-end">
        {selected && <Ionicons color={foreground} name="checkmark" size={18} />}
      </View>
    </PresstableOpacity>
  );
}

PickerSheet.Option = PickerOption;
