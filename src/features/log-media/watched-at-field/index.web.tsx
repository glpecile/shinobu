import { Text, View } from 'react-native';
import type { ReactNode } from 'react';

export interface WatchedAtFieldProps {
  value: Date | null;
  onChange: (value: Date | null) => void;
  label?: string;
  children?: ReactNode;
}

/** Local YYYY-MM-DD (toISOString would shift the day across timezones). */
function toInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Uses current time-of-day on picked dates so UTC conversion does not shift the local calendar day. */
export function WatchedAtField({
  value,
  onChange,
  label = 'Watched on',
  children,
}: WatchedAtFieldProps) {
  const today = toInputValue(new Date());
  return (
    <View className="mt-4 flex-row items-center gap-2">
      <View className="h-11 flex-1 flex-row items-center justify-between border border-border rounded-full px-4">
        <Text className="text-muted font-sans text-sm">{label}</Text>
        <input
          aria-label={label}
          // appearance-none drops Safari's default rounded fill on date inputs.
          className="appearance-none self-stretch bg-transparent text-foreground font-sans text-sm"
          max={today}
          // Browsers tint the native date-picker icon from color-scheme, not color.
          style={{ colorScheme: 'light dark' }}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === '' || raw === today) {
              onChange(null);
              return;
            }
            const [year, month, day] = raw.split('-').map(Number);
            const now = new Date();
            onChange(new Date(year, month - 1, day, now.getHours(), now.getMinutes()));
          }}
          type="date"
          value={value != null ? toInputValue(value) : today}
        />
      </View>
      {children}
    </View>
  );
}
