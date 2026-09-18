import { createContext, type ReactNode, useContext } from 'react';
import { Text, View } from 'react-native';

import { Eyebrow } from '@/components/eyebrow';
import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';

type PickerValue = string | number | null;

const PickerContext = createContext<{
  value: PickerValue;
  select: (value: PickerValue) => void;
}>({ value: null, select: () => {} });

/**
 * Single-choice list in the app's bottom sheet: a titled column of options,
 * each with an optional leading icon and a trailing count, the chosen one on
 * the tonal pill the nav bars use. Picking selects and closes.
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
      <Eyebrow className="mb-3">{title}</Eyebrow>
      <PickerContext.Provider value={{ value, select }}>
        <View className="gap-1">{children}</View>
      </PickerContext.Provider>
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
  const selected = picker.value === value;

  return (
    <PresstableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      // The negative margin lets the pill bleed past the text, so labels stay
      // aligned with the title. It bleeds half the sheet's padding, which
      // leaves the pill as far from the sheet's edge as its text is from its own.
      className={cn(
        '-mx-3 flex-row items-center gap-3 rounded-full px-3 py-2.5',
        selected && 'bg-accent-tonal',
      )}
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
    </PresstableOpacity>
  );
}

PickerSheet.Option = PickerOption;
