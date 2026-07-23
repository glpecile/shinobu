import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { PresstableScale } from '@/components/presstable';
import {
  calendarBadges,
  continueWatchingBadges,
} from '@/features/up-next/badges';
import { calendarWeek } from '@/features/up-next/compute';
import { useUpNextSections } from '@/features/up-next/use-up-next-sections';
import { EpisodeCard } from '@/features/up-next/ui/episode-card';
import { QuickLogButton } from '@/features/up-next/ui/quick-log-button';
import { UpNextSectionHeader } from '@/features/up-next/ui/section-header';
import { shortWeekdayName } from '@/lib/time/relative-day';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * Up Next on the home feed (plan 0019): what's ready to watch, and what's
 * coming this week. Chosen from three prototyped treatments on 2026-07-23 —
 * a 7-day strip that filters the cards beneath it.
 *
 * The strip spans exactly the Calendar window (today … today+6), so every
 * entry has a selectable day, and the cells derive their membership from the
 * same local-day grouping the badges use — no drift between the two.
 *
 * Continue Watching sits above the strip as a constant row: it is not part of
 * any day. The selected day is ephemeral UI state, deliberately not persisted.
 */
export interface UpNextSectionProps {
  onItemPress: (item: NormalizedMediaItem) => void;
  onItemActions: (item: NormalizedMediaItem) => void;
}

// A landscape card row's height (art h-36 = 144, + mt-2 gap and two text
// lines). The day's content area reserves this whether it holds cards or the
// empty-state line, so tapping between days never shifts the feed below.
const DAY_CONTENT_MIN_HEIGHT = 188;

export function UpNextSection({
  onItemPress,
  onItemActions,
}: UpNextSectionProps) {
  const { continueWatching, calendar, now } = useUpNextSections();
  const [selectedOffset, setSelectedOffset] = useState(0);

  if (continueWatching.length === 0 && calendar.length === 0) return null;

  // Feed the strip *both* sections: today's already-aired episodes (which live
  // in Continue Watching) still belong on the today cell — the strip is a
  // schedule, not a second view of the aired/upcoming split. Off-window and
  // instant-less entries fall out inside `calendarWeek`.
  const week = calendarWeek([...continueWatching, ...calendar], now);
  const selected = week.find((day) => day.offset === selectedOffset) ?? week[0];

  return (
    <View>
      {continueWatching.length > 0 && (
        <UpNextSectionHeader
          collapseKey="up-next-continue"
          title="Continue Watching"
        >
          <ScrollView
            horizontal
            className="px-4"
            showsHorizontalScrollIndicator={false}
          >
            {continueWatching.map((entry) => (
              <View key={entry.item.id} className="mr-3">
                <EpisodeCard
                  action={<QuickLogButton entry={entry} />}
                  badges={continueWatchingBadges(entry, now)}
                  entry={entry}
                  onActionsPress={onItemActions}
                  onPress={onItemPress}
                />
              </View>
            ))}
          </ScrollView>
        </UpNextSectionHeader>
      )}

      <UpNextSectionHeader
        collapseKey="up-next-calendar"
        title="This week"
      >
        <ScrollView
          horizontal
          className="px-4"
          showsHorizontalScrollIndicator={false}
        >
          {week.map((day) => {
            const isSelected = day.offset === selected.offset;
            return (
              <PresstableScale
                key={day.offset}
                accessibilityLabel={`${day.label}, ${day.entries.length} airing`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className={`w-14 py-2 mr-2 items-center rounded-md border ${
                  isSelected
                    ? 'bg-accent border-accent'
                    : 'bg-surface border-border/60'
                }`}
                onPress={() => setSelectedOffset(day.offset)}
              >
                <Text
                  className={`font-sans text-xs ${
                    isSelected ? 'text-accent-foreground' : 'text-muted'
                  }`}
                >
                  {shortWeekdayName(day.date)}
                </Text>
                <Text
                  className={`font-sans-semibold text-base ${
                    isSelected ? 'text-accent-foreground' : 'text-foreground'
                  }`}
                >
                  {day.date.getDate()}
                </Text>
                {/* A dot, not a count: the strip answers "is there anything
                    that day", the cards below answer what. */}
                <View
                  className={`w-1.5 h-1.5 rounded-full mt-1 ${
                    day.entries.length > 0
                      ? isSelected
                        ? 'bg-accent-foreground'
                        : 'bg-accent'
                      : 'bg-transparent'
                  }`}
                />
              </PresstableScale>
            );
          })}
        </ScrollView>

        {/* Fixed height so switching to an empty day never collapses the row
            and shifts the feed beneath it — the empty line sits in the space a
            card row would occupy. */}
        <View className="mt-3" style={{ minHeight: DAY_CONTENT_MIN_HEIGHT }}>
          {selected.entries.length === 0 ? (
            <Text className="text-muted font-sans text-sm px-4">
              {/* "today"/"tomorrow" read as adverbs; a weekday needs its "on". */}
              {selected.offset <= 1
                ? `Nothing airing ${selected.label.toLowerCase()}.`
                : `Nothing airing on ${selected.label}.`}
            </Text>
          ) : (
            <ScrollView
              horizontal
              className="px-4"
              showsHorizontalScrollIndicator={false}
            >
              {selected.entries.map((entry) => (
                <View key={entry.item.id} className="mr-3">
                  <EpisodeCard
                    // Aired-today episodes are watchable right now, so they
                    // keep the quick-log checkmark here too; still-upcoming
                    // ones only carry their day badge.
                    action={
                      entry.status === 'aired' ? (
                        <QuickLogButton entry={entry} />
                      ) : undefined
                    }
                    badges={
                      entry.status === 'aired'
                        ? continueWatchingBadges(entry, now)
                        : calendarBadges(entry, now)
                    }
                    entry={entry}
                    onActionsPress={onItemActions}
                    onPress={onItemPress}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </UpNextSectionHeader>
    </View>
  );
}
