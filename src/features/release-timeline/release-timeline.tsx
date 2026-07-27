import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { releaseStops, type ReleaseStop } from '@/features/release-timeline/stops';
import { cn } from '@/lib/cn';
import { formatCalendarDate } from '@/lib/time/calendar-date';
import type { NormalizedMediaItem, ReleaseCalendar } from '@/types/media';

/**
 * Row geometry, shared by the dot and the trunk so the connector is
 * pixel-exact (same trick as the diary's tree connector). Rows are a fixed
 * height because every one of them is a single line — nothing here can grow.
 */
const ROW_HEIGHT = 36;
const ROW_CENTER = ROW_HEIGHT / 2;

/**
 * How you'd actually watch it, one glyph per stop — the labels read alike
 * ("Digital"/"Physical" are both just words) while a film strip, a phone and a
 * disc are separable at a glance. Ionicons ships no popcorn, so theatrical
 * takes the film strip; every name here is font-based, so the three render
 * identically on web, iOS and Android with no per-platform fallback.
 */
const ICONS: Record<keyof ReleaseCalendar, ComponentProps<typeof Ionicons>['name']> = {
  theatrical: 'film-outline',
  digital: 'phone-portrait-outline',
  physical: 'disc-outline',
};

function Stop({
  stop,
  first,
  last,
}: {
  stop: ReleaseStop;
  first: boolean;
  last: boolean;
}) {
  const accent = useCSSVariable('--color-accent');
  const muted = useCSSVariable('--color-muted');
  const iconColor = stop.upcoming ? accent : muted;

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
      {/* Fixed-width and centered: the three glyphs aren't the same width, and
          the labels have to start on one line for the rail to read as a rail. */}
      <View className="w-5 items-center mr-2">
        <Ionicons
          color={typeof iconColor === 'string' ? iconColor : undefined}
          name={ICONS[stop.kind]}
          size={15}
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
 * "In theaters · Digital · Physical" as a rail below Studios (plan 0029),
 * replacing the single muted "Digital release · …" line that used to sit under
 * the meta line. It takes the same `mt-8` + display-heading shell as its
 * neighbours down there (Seasons, Cast, Studios, View on) rather than the
 * small uppercase label a header-adjacent block would use.
 *
 * Movie-only in practice: `releaseCalendar` comes from the TMDB movie
 * catalogue alone, so a TV/manga item or a tokenless page renders nothing —
 * no guard at the call site.
 */
export function ReleaseTimeline({ item }: { item: NormalizedMediaItem }) {
  const stops = releaseStops(item.releaseCalendar);
  if (stops.length === 0) return null;

  return (
    <View className="mt-8">
      <Text className="text-xl font-display text-foreground mb-2">Release</Text>
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
