import { Text, View } from 'react-native';

import { releaseStops, type ReleaseStop } from '@/features/release-timeline/stops';
import { cn } from '@/lib/cn';
import { formatCalendarDate } from '@/lib/time/calendar-date';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * Row geometry, shared by the dot and the trunk so the connector is
 * pixel-exact (same trick as the diary's tree connector). Rows are a fixed
 * height because every one of them is a single line — nothing here can grow.
 */
const ROW_HEIGHT = 36;
const ROW_CENTER = ROW_HEIGHT / 2;

function Stop({
  stop,
  first,
  last,
}: {
  stop: ReleaseStop;
  first: boolean;
  last: boolean;
}) {
  return (
    <View className="flex-row items-center h-9">
      <View className="w-4 h-9 relative">
        {/* The trunk runs the full row for a middle stop, and stops at the dot
            on the first and last — so the rail spans the dots, never dangling
            past either end. A lone stop gets no trunk at all. */}
        {!(first && last) && (
          <View
            className="absolute left-2 w-px bg-border"
            style={{
              top: first ? ROW_CENTER : 0,
              ...(last ? { height: ROW_CENTER } : { bottom: 0 }),
            }}
          />
        )}
        <View
          className={cn(
            'absolute rounded-full',
            stop.upcoming
              ? 'left-[3px] top-[13px] w-2.5 h-2.5 border-2 border-accent bg-background'
              : 'left-1 top-[14px] w-2 h-2 bg-muted',
          )}
        />
      </View>
      <Text
        className={cn(
          'flex-1 font-sans text-sm',
          stop.upcoming ? 'text-foreground font-sans-semibold' : 'text-foreground/90',
        )}
        numberOfLines={1}
      >
        {stop.label}
      </Text>
      {/* The countdown leads on an upcoming stop: "when can I watch this" is
          the question the date alone answers slowest. */}
      <Text
        className={cn(
          'font-sans text-sm ml-3',
          stop.upcoming ? 'text-accent font-sans-semibold' : 'text-muted',
        )}
        numberOfLines={1}
      >
        {stop.relative != null
          ? `${stop.relative} · ${formatCalendarDate(stop.date)}`
          : formatCalendarDate(stop.date)}
      </Text>
    </View>
  );
}

/**
 * "In theaters · Digital · Physical" as a small rail under the details header
 * (plan 0029), replacing the single muted "Digital release · …" line. Movie-
 * only in practice: `releaseCalendar` comes from the TMDB movie catalogue
 * alone, so a TV/manga item or a tokenless page renders nothing — no guard at
 * the call site.
 */
export function ReleaseTimeline({ item }: { item: NormalizedMediaItem }) {
  const stops = releaseStops(item.releaseCalendar);
  if (stops.length === 0) return null;

  return (
    <View className="mb-6">
      <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-1">
        Release
      </Text>
      {stops.map((stop, index) => (
        <Stop
          first={index === 0}
          key={stop.kind}
          last={index === stops.length - 1}
          stop={stop}
        />
      ))}
    </View>
  );
}
