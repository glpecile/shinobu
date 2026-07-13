import { Text, View } from 'react-native';

/** Mirrors index.tsx — keep both platform variants' props identical. */
export interface WatchedAtFieldProps {
  value: Date | null;
  onChange: (value: Date | null) => void;
}

/** Local YYYY-MM-DD (toISOString would shift the day across timezones). */
function toInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Web fallback: the community picker has no web build, so this renders the
 * browser's own date input. The input *displays* today while `value` is null
 * (an empty mm/dd/yyyy placeholder reads as broken), but null still means
 * "just now" — watchedAt is omitted so Trakt stamps the confirm-time instant;
 * only an actual pick becomes a backdate. The picked calendar day keeps the
 * current time-of-day so the stored instant lands inside the chosen local
 * date, not on a midnight boundary that can shift a day when converted to UTC.
 */
export function WatchedAtField({ value, onChange }: WatchedAtFieldProps) {
  const today = toInputValue(new Date());
  return (
    <View className="mt-4 flex-row items-center justify-between border border-border rounded px-4 py-3">
      <Text className="text-muted font-sans text-sm">Watched on</Text>
      <input
        className="bg-surface text-foreground font-sans text-sm border border-border rounded px-2 py-1"
        max={today}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '' || raw === today) {
            onChange(null);
            return;
          }
          const [year, month, day] = raw.split('-').map(Number);
          const now = new Date();
          onChange(
            new Date(year, month - 1, day, now.getHours(), now.getMinutes()),
          );
        }}
        type="date"
        value={value != null ? toInputValue(value) : today}
      />
    </View>
  );
}
