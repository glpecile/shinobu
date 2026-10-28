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

/**
 * Settings radio group of preview cards with a label under each, like
 * Appearance and App icon. Selecting the current option is a no-op.
 *
 * ```tsx
 * <PreviewPicker label="Theme" value={preference} onSelect={setThemePreference}>
 *   <PreviewPicker.Option value="dark">
 *     <PreviewPicker.Preview className="aspect-4/5">…</PreviewPicker.Preview>
 *     <PreviewPicker.Label>Dark</PreviewPicker.Label>
 *   </PreviewPicker.Option>
 * </PreviewPicker>
 * ```
 */
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
      // RNGH web dispatches presses only for button roles.
      accessibilityRole={process.env.EXPO_OS === 'web' ? 'button' : 'radio'}
      accessibilityState={{ checked }}
      aria-pressed={process.env.EXPO_OS === 'web' ? checked : undefined}
      className="flex-1 items-center gap-2 rounded-2xl web:focus-visible:outline-2 web:focus-visible:outline-foreground web:focus-visible:outline-offset-2"
      onPress={() => group.select(value)}
      pressBehavior="immediate"
    >
      <CheckedContext.Provider value={checked}>{children}</CheckedContext.Provider>
    </PresstableScale>
  );
}

/** The card; `className` sizes it (e.g. an aspect ratio) when its content doesn't. */
function Preview({ children, className }: { children: ReactNode; className?: string }) {
  const checked = useContext(CheckedContext);
  return (
    // Transparent when unselected so selecting doesn't shift the layout.
    <View className={cn('w-full rounded-2xl border-2 border-transparent p-0.5', checked && 'border-foreground')}>
      <View className={cn('w-full overflow-hidden rounded-xl', className)}>
        {children}
        {/* Drawn last so the edge stays visible over a preview matching the background. */}
        <View className="absolute inset-0 rounded-xl border border-border" style={{ pointerEvents: 'none' }} />
      </View>
    </View>
  );
}

function Label({ children }: { children: ReactNode }) {
  const checked = useContext(CheckedContext);
  return (
    <Text className={cn('font-sans text-sm text-foreground', checked && 'font-sans-semibold')} numberOfLines={1}>
      {children}
    </Text>
  );
}

PreviewPicker.Option = Option;
PreviewPicker.Preview = Preview;
PreviewPicker.Label = Label;
