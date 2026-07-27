import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  FadeIn,
  Keyframe,
  useReducedMotion,
  type EntryOrExitLayoutType,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { PresstableScale } from '@/components/presstable';
import {
  calendarBadges,
  continueWatchingBadges,
} from '@/features/up-next/badges';
import { calendarWeek } from '@/features/up-next/compute';
import { groupDayEntries, soloGroup } from '@/features/up-next/group';
import { useUpNextSections } from '@/features/up-next/use-up-next-sections';
import { EpisodeCard, STACK_OFFSET } from '@/features/up-next/ui/episode-card';
import { QuickLogButton } from '@/features/up-next/ui/quick-log-button';
import { UpNextSectionHeader } from '@/features/up-next/ui/section-header';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT, KEYFRAME_EASE_OUT } from '@/lib/motion';
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

// Headroom above the day's cards for a stacked group's card backs, which sit
// `STACK_OFFSET * 2` px above the face card and would otherwise be clipped by
// the row. Applied whether or not the day holds a stack: paying it only
// sometimes would move every card down by 10px the moment a season dropped.
const STACK_HEADROOM = STACK_OFFSET * 2;

// A landscape card row's height (art h-36 = 144, + mt-2 gap and two text
// lines), plus the stack headroom above it. The day's content area reserves
// this whether it holds cards or the empty-state line, so tapping between days
// never shifts the feed below.
const DAY_CONTENT_MIN_HEIGHT = 188 + STACK_HEADROOM;

// Beyond this the dots would overflow the ~56px cell; several shows sharing a
// day is already the busy case, so an exact tally past it earns nothing.
const MAX_DAY_DOTS = 5;

/**
 * The day's cards settle in when the user picks a different day, instead of the
 * old hard cut where one set of cards was replaced by another mid-blink. The
 * travel is deliberately tiny (6px): the tiles above already say *what*
 * changed, so this only needs to say *that* something did. Module scope, per
 * Reanimated's animation-builder performance rule.
 */
const DAY_CONTENT_RISE = 6;

const dayContentEntering = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: DAY_CONTENT_RISE }] },
  100: {
    opacity: 1,
    transform: [{ translateY: 0 }],
    easing: KEYFRAME_EASE_OUT,
  },
}).duration(DURATION.swap);

/** Reduced motion keeps the fade and drops the travel (matches the lightbox). */
const dayContentFading = FadeIn.duration(DURATION.swap);

/**
 * `undefined` until the user has actually switched days: an element sitting in
 * its resting position when the feed first paints has no reason to play an
 * entrance — the motion belongs to the state change, not the page load.
 */
function dayContentAnimation(
  switched: boolean,
  reduceMotion: boolean,
): EntryOrExitLayoutType | undefined {
  if (!switched) return undefined;
  return reduceMotion ? dayContentFading : dayContentEntering;
}

/**
 * The empty-day line. "Today" is special: its episodes have already aired (and
 * live in Continue Watching), so it reads as done rather than as if nothing
 * happened — anything still to come today would occupy the cell, not this line.
 */
function emptyDayCopy(offset: number, label: string): string {
  if (offset === 0) return "That's all for today.";
  if (offset === 1) return 'Nothing airing tomorrow.';
  return `Nothing airing on ${label}.`;
}

export function UpNextSection({
  onItemPress,
  onItemActions,
}: UpNextSectionProps) {
  const { continueWatching, calendar, now } = useUpNextSections();
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [switchedDay, setSwitchedDay] = useState(false);
  const reduceMotion = useReducedMotion();

  if (continueWatching.length === 0 && calendar.length === 0) return null;

  // Feed the strip *both* sections: today's already-aired episodes (which live
  // in Continue Watching) still belong on the today cell — the strip is a
  // schedule, not a second view of the aired/upcoming split. Off-window and
  // instant-less entries fall out inside `calendarWeek`.
  //
  // Grouped straight after bucketing, so everything below this line — the dots
  // and the cards alike — counts *cards*, not entries. That is what stops a
  // ten-episode season drop reading as five dots (the cap) on a day that holds
  // two shows, while a genuinely busy five-show day reads identically.
  const week = calendarWeek([...continueWatching, ...calendar], now).map(
    (day) => ({ ...day, groups: groupDayEntries(day.entries) }),
  );
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
            {/* Keyed on the *entry* id, not the item's: one film contributes a
                theatrical and a streaming row that share an item id (R3), so
                keying on the item would collide the moment both land on the
                same day. The entry id carries the episode or release kind. */}
            {continueWatching.map((entry) => (
              <View key={entry.id} className="mr-3">
                <EpisodeCard
                  // Continue Watching is aired episodes by construction; the
                  // narrowing is what the union buys — no release row can slip
                  // in here and render a quick-log for something with no episode.
                  action={
                    entry.kind === 'episode' ? (
                      <QuickLogButton entry={entry} />
                    ) : undefined
                  }
                  badges={continueWatchingBadges(entry, now)}
                  // Wrapped, not grouped: this section holds one entry per show
                  // by construction (the pool fan answers with a single
                  // `next_episode` pointer each), so it can't produce a batch.
                  group={soloGroup(entry)}
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
                accessibilityLabel={`${day.label}, ${day.groups.length} airing`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className="mr-2"
                onPress={() => {
                  setSwitchedDay(true);
                  setSelectedOffset(day.offset);
                }}
              >
                <View className="w-14 py-2 items-center">
                  {/* Selection crossfades instead of hard-flipping classNames.
                      Two stacked full-bleed layers rather than an animated
                      colour: opacity is the one property that's free on the
                      GPU, and it keeps both states expressed as theme tokens
                      (an animated `backgroundColor` would need the hex resolved
                      out of the token and would lose the unselected border's
                      /60 alpha). The resting layer sits underneath, so a
                      dropped/unresolved animation still renders a correct
                      tile. */}
                  <View className="absolute inset-0 rounded-md border border-border/60 bg-surface" />
                  <AnimatedView
                    className="absolute inset-0 rounded-md border border-accent bg-accent"
                    style={{
                      opacity: isSelected ? 1 : 0,
                      transitionProperty: 'opacity',
                      // Strong ease-out, not `ease`: the fill is >60% of the
                      // way there within ~40ms, so the label and dots — which
                      // flip colour instantly, there being no animated Text
                      // wrapper in the app — are never stranded on the wrong
                      // background long enough to read as a flash.
                      transitionDuration: DURATION.color,
                      transitionTimingFunction: EASE_OUT,
                    }}
                  />
                  <Text
                    className={cn(
                      'font-sans text-xs',
                      isSelected ? 'text-accent-foreground' : 'text-muted',
                    )}
                  >
                    {shortWeekdayName(day.date)}
                  </Text>
                  <Text
                    className={cn(
                      'font-sans-semibold text-base',
                      isSelected ? 'text-accent-foreground' : 'text-foreground',
                    )}
                  >
                    {day.date.getDate()}
                  </Text>
                  {/* One dot per *card* airing that day (capped), so the strip
                      conveys *how much* at a glance, not just whether. Cards,
                      not episodes: a season drop is one thing happening that
                      day, and counting its ten episodes would peg the cap and
                      make it indistinguishable from a five-show day. The row is
                      a fixed height whether it holds dots or not, so cells never
                      change size across days. */}
                  <View className="flex-row items-center gap-0.5 mt-1 h-1.5">
                    {Array.from({
                      length: Math.min(day.groups.length, MAX_DAY_DOTS),
                    }).map((_, index) => (
                      <View
                        key={index}
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          isSelected ? 'bg-accent-foreground' : 'bg-accent',
                        )}
                      />
                    ))}
                  </View>
                </View>
              </PresstableScale>
            );
          })}
        </ScrollView>

        {/* Fixed height so switching to an empty day never collapses the row
            and shifts the feed beneath it — the empty line sits in the space a
            card row would occupy. */}
        <View className="mt-3" style={{ minHeight: DAY_CONTENT_MIN_HEIGHT }}>
          {/* Keyed on the day so picking a new one remounts and replays the
              enter. Enter-only, no exit: an exiting copy would sit in flow
              beside the incoming one and shove the feed around — the reserved
              minHeight above is what keeps the swap visually still. */}
          <AnimatedView
            key={selected.offset}
            className="flex-1"
            entering={dayContentAnimation(switchedDay, reduceMotion)}
          >
            {selected.groups.length === 0 ? (
              // Centered in the reserved space so the empty day reads as a
              // deliberate state, not a layout gap. The 忍 mark renders in the
              // OS fallback font (neither app family ships kanji, AGENTS.md
              // Theming).
              <View className="flex-1 items-center justify-center px-4">
                <Text className="text-muted/40 text-4xl mb-2">忍</Text>
                <Text className="text-muted font-sans text-sm text-center">
                  {emptyDayCopy(selected.offset, selected.label)}
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                // The top padding is the stack headroom: a grouped card's backs
                // sit above its face card, and a horizontal ScrollView clips at
                // its own frame.
                className="px-4"
                contentContainerStyle={{ paddingTop: STACK_HEADROOM }}
                showsHorizontalScrollIndicator={false}
              >
                {/* Entry id, for the same reason as Continue Watching above —
                    carried on the group by its lead. */}
                {selected.groups.map((group) => (
                  <View key={group.id} className="mr-3">
                    <EpisodeCard
                      // Aired-today episodes are watchable right now, so they
                      // keep the quick-log checkmark here too; still-upcoming
                      // ones — and release rows, which are never loggable —
                      // only carry their day badge. A batch never gets one
                      // either: the checkmark logs a single episode, and there
                      // is no honest answer to which of ten it would advance.
                      action={
                        group.entries.length === 1 &&
                        group.lead.status === 'aired' &&
                        group.lead.kind === 'episode' ? (
                          <QuickLogButton entry={group.lead} />
                        ) : undefined
                      }
                      badges={
                        group.lead.status === 'aired'
                          ? continueWatchingBadges(group.lead, now)
                          : calendarBadges(group.lead, now)
                      }
                      group={group}
                      onActionsPress={onItemActions}
                      onPress={onItemPress}
                    />
                  </View>
                ))}
              </ScrollView>
            )}
          </AnimatedView>
        </View>
      </UpNextSectionHeader>
    </View>
  );
}
