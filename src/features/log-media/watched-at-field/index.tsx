import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useState, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { haptics } from '@/lib/haptics';

export interface WatchedAtFieldProps {
  /** null means "just now" (omits watchedAt). */
  value: Date | null;
  onChange: (value: Date | null) => void;
  label?: string;
  children?: ReactNode;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function WatchedAtField({
  value,
  onChange,
  label = 'Watched on',
  children,
}: WatchedAtFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <View className="mt-4">
      <View className="flex-row items-center gap-2">
        <View className="h-11 flex-1 flex-row items-center justify-between border border-border rounded-full px-4">
          <Text className="text-muted font-sans text-sm">{label}</Text>
          <View className="flex-row items-center gap-2">
            {value != null && (
              <PresstableOpacity
                accessibilityLabel="Set to now"
                accessibilityRole="button"
                className="h-11 min-w-11 items-center justify-center"
                onPress={() => {
                  haptics.selection();
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Text className="text-accent font-sans-semibold text-sm">Now</Text>
              </PresstableOpacity>
            )}
            <PresstableOpacity
              accessibilityLabel={`${label}, ${value != null ? formatDate(value) : 'Just now'}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              aria-expanded={open}
              className="h-11 justify-center"
              onPress={() => {
                haptics.selection();
                setOpen(!open);
              }}
              pressBehavior="immediate"
            >
              <Text className="text-foreground font-sans-semibold text-sm">
                {value != null ? formatDate(value) : 'Just now'}
              </Text>
            </PresstableOpacity>
          </View>
        </View>
        {children}
      </View>
      {open && (
        <DateTimePicker
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          mode="date"
          onDismiss={() => setOpen(false)}
          onValueChange={(_event, date) => {
            // Android's dialog is one-shot (confirm/cancel unmounts it); the
            // iOS spinner stays inline until the row is tapped again.
            if (Platform.OS === 'android') setOpen(false);
            onChange(date);
          }}
          value={value ?? new Date()}
        />
      )}
    </View>
  );
}
