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
      <Sheet.Header className="items-center mb-3">
        <Eyebrow>{title}</Eyebrow>
      </Sheet.Header>
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
      aria-pressed={selected}
      className={cn(
        '-mx-3 flex-row items-center gap-3 rounded-full px-3 py-2.5',
        selected && 'bg-accent-tonal',
      )}
      onPress={() => picker.select(value)}
    >
      {icon}
      <Text className="flex-1 font-sans text-base text-foreground">{label}</Text>
      {count != null && <Text className="text-muted font-sans text-sm">{count}</Text>}
    </PresstableOpacity>
  );
}

PickerSheet.Option = PickerOption;
