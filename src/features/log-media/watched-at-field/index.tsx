import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { haptics } from '@/lib/haptics';

export interface WatchedAtFieldProps {
  /** null = "just now" — the mutation omits watchedAt and Trakt records now. */
  value: Date | null;
  onChange: (value: Date | null) => void;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * "Watched on" row inside the log sheet (plan 0008): tap toggles the native
 * date picker (iOS spinner inline — the sheet's content detent grows with it;
 * Android presents its dialog). Backdating only — future watches make no
 * sense, so `maximumDate` is now.
 */
export function WatchedAtField({ value, onChange }: WatchedAtFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <View className="mt-4">
      <View className="flex-row items-center justify-between border border-border rounded px-4 py-3">
        <Text className="text-muted font-sans text-sm">Watched on</Text>
        <View className="flex-row items-center gap-3">
          {value != null && (
            <PresstableOpacity
              onPress={() => {
                haptics.selection();
                onChange(null);
                setOpen(false);
              }}
            >
              <Text className="text-accent font-sans-semibold text-sm">
                Now
              </Text>
            </PresstableOpacity>
          )}
          <PresstableOpacity
            onPress={() => {
              haptics.selection();
              setOpen(!open);
            }}
          >
            <Text className="text-foreground font-sans-semibold text-sm">
              {value != null ? formatDate(value) : 'Just now'}
            </Text>
          </PresstableOpacity>
        </View>
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
