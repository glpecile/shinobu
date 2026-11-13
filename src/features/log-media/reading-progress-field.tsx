import { useRef } from 'react';
import type { TextInputInstance } from 'react-native';
import { Text, View } from 'react-native';

import { NativeSwitch } from '@/components/native-switch';
import { TextField } from '@/components/text-field';
import { cn } from '@/lib/cn';

/** A book log's form state: the page reached, or the whole book. */
export interface ReadingProgress {
  finished: boolean;
  page: number;
  /** The edition's page count, the field's cap. Absent when Hardcover has none. */
  total?: number;
  /** The book is already Read, so this log is another read of it. */
  reread?: boolean;
}

/** The one string the book form speaks: its title and confirm label. */
export function readingTitle(reading: ReadingProgress): string {
  if (reading.finished) return reading.reread === true ? 'Log reread' : 'Mark as read';
  if (reading.page > 0) return `Log page ${reading.page}`;
  return reading.reread === true ? 'Start reread' : 'Start reading';
}

/**
 * The book log form's progress fields (plan 0117 B3): a Finished switch, and
 * the page reached while it is off. Pages are their own unit (KTD-3). Typed
 * text keeps only digits and stops at the page count, so the form never holds
 * a page the book does not have.
 */
export function ReadingProgressField({ value, onChange, pending }: {
  value: ReadingProgress;
  onChange: (value: ReadingProgress) => void;
  pending: boolean;
}) {
  const input = useRef<TextInputInstance>(null);
  const bounds = value.total == null ? 'The page you reached.' : `Page 0 to ${value.total}.`;

  return (
    <View className={cn('mt-5 gap-3', pending && 'opacity-50')}>
      <View className="flex-row items-center justify-between">
        <Text className="text-foreground font-sans-semibold text-sm">Finished the book</Text>
        <NativeSwitch
          accessibilityLabel="Finished the book"
          disabled={pending}
          onValueChange={(finished) => onChange({ ...value, finished })}
          value={value.finished}
        />
      </View>
      {!value.finished && (
        <View className="gap-2">
          <Text
            className="text-foreground font-sans-semibold text-sm"
            onPress={() => input.current?.focus()}
          >
            Page
          </Text>
          <TextField
            ref={input}
            accessibilityHint={bounds}
            accessibilityLabel="Page"
            editable={!pending}
            inputMode="numeric"
            onChangeText={(text) => {
              const page = Number(text.replace(/\D/g, '').slice(0, 5));
              onChange({ ...value, page: Math.min(page, value.total ?? page) });
            }}
            returnKeyType="done"
            selectTextOnFocus
            value={value.page === 0 ? '' : String(value.page)}
          />
          <Text className="text-muted font-sans text-xs">{bounds}</Text>
        </View>
      )}
    </View>
  );
}
