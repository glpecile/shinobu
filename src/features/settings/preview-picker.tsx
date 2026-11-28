import { createContext, type ReactNode, useContext } from 'react';
import { Text, View } from 'react-native';

import { PresstableScale } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';

const GroupContext = createContext<{ value: string; select: (next: string) => void }>({
  value: '',
  select: () => undefined,
});
const CheckedContext = createContext(false);

export function PreviewPicker<T extends string>({
  children,
  label,
  onSelect,
  value,
}: {
  children: ReactNode;
  label: string;
  onSelect: (next: T) => void;
  value: T;
}) {
  function select(next: string) {
    if (next === value) return;
    haptics.selection();
    onSelect(next as T);
  }

  return (
    <GroupContext.Provider value={{ value, select }}>
      <View
        accessibilityLabel={label}
        accessibilityRole={process.env.EXPO_OS === 'web' ? undefined : 'radiogroup'}
        className="w-full max-w-sm flex-row gap-2.5"
      >
        {children}
      </View>
    </GroupContext.Provider>
  );
}

function Option({ children, value }: { children: ReactNode; value: string }) {
  const group = useContext(GroupContext);
  const checked = value === group.value;
  return (
    <PresstableScale
      // The web Presstable is always a button, so aria-pressed carries the state there.
      accessibilityRole={process.env.EXPO_OS === 'web' ? 'button' : 'radio'}
      accessibilityState={{ checked }}
      aria-pressed={process.env.EXPO_OS === 'web' ? checked : undefined}
      className="flex-1 items-center gap-2 rounded-xl web:focus-visible:outline-2 web:focus-visible:outline-foreground web:focus-visible:outline-offset-2"
      onPress={() => group.select(value)}
      pressBehavior="immediate"
    >
      <CheckedContext.Provider value={checked}>{children}</CheckedContext.Provider>
    </PresstableScale>
  );
}

function Preview({ children, className }: { children: ReactNode; className?: string }) {
  const checked = useContext(CheckedContext);
  return (
    <View
      className={cn(
        'w-full rounded-xl border-2 border-transparent p-0.5',
        checked && 'border-foreground',
      )}
    >
      <View className={cn('w-full overflow-hidden rounded-lg', className)}>
        {children}
        <View
          className="absolute inset-0 rounded-lg border border-border"
          style={{ pointerEvents: 'none' }}
        />
      </View>
    </View>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <Text className="font-sans text-sm text-foreground" numberOfLines={1}>
      {children}
    </Text>
  );
}

PreviewPicker.Option = Option;
PreviewPicker.Preview = Preview;
PreviewPicker.Label = Label;
