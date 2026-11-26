import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';

import { Section } from '@/components/section';
import { releaseStops, type ReleaseStop } from '@/features/release-timeline/stops';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';
import { formatCalendarDate } from '@/lib/time/calendar-date';
import type { NormalizedMediaItem, ReleaseCalendar } from '@/types/media';

const ROW_HEIGHT = 36;
const ROW_CENTER = ROW_HEIGHT / 2;

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
  const accent = useThemeColor('--color-accent');
  const muted = useThemeColor('--color-muted');
  const iconColor = stop.upcoming ? accent : muted;

  return (
    <View className="flex-row items-center h-9">
      <View className="w-4 h-9 relative">
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
              ? 'left-0.75 top-3.25 w-2.5 h-2.5 border-2 border-accent bg-background'
              : 'left-1 top-3.5 w-2 h-2 bg-muted',
          )}
        />
      </View>
      <View className="w-5 items-center mr-2">
        <Ionicons
          color={iconColor}
          name={ICONS[stop.kind]}
          size={15}
        />
      </View>
      <Text
        className={cn(
          'flex-1 font-sans text-sm',
          stop.upcoming ? 'text-foreground font-sans-semibold' : 'text-foreground',
        )}
        numberOfLines={1}
      >
        {stop.label}
      </Text>
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

export function ReleaseTimeline({ item }: { item: NormalizedMediaItem }) {
  const stops = releaseStops(item.releaseCalendar);
  if (stops.length === 0) return null;

  return (
    <Section>
      <Section.Header>
        <Section.Title>Release</Section.Title>
      </Section.Header>
      {stops.map((stop, index) => (
        <Stop
          first={index === 0}
          key={stop.kind}
          last={index === stops.length - 1}
          stop={stop}
        />
      ))}
    </Section>
  );
}
