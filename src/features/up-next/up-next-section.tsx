import { Fragment, useReducer, useState } from 'react';
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import {
  FadeIn,
  Keyframe,
  useReducedMotion,
  type EntryOrExitLayoutType,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { MorphText } from '@/components/morph-text';
import { VirtualizedRail } from '@/components/rail';
import {
  calendarBadges,
  continueWatchingBadges,
} from '@/features/up-next/badges';
import { calendarWeek, nextSplitChange } from '@/features/up-next/compute';
import { groupDayEntries, soloGroup } from '@/features/up-next/group';
import { useUpNextSections } from '@/features/up-next/use-up-next-sections';
import { CARD_EXIT, CardSlot } from '@/features/up-next/ui/card-slot';
import { episodeCardRailHeight, STACK_OFFSET } from '@/features/up-next/ui/metrics';
import { QuickLogButton } from '@/features/up-next/ui/quick-log-button';
import { WeekStrip } from '@/features/up-next/ui/week-strip';
import { CollapsibleSection } from '@/components/collapsible-section';
import { SectionEnter, useArrivalHistory } from '@/components/section-enter';
import { DURATION, KEYFRAME_EASE_OUT } from '@/lib/motion';
import { useWakeAt } from '@/lib/time/use-wake-at';
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

/**
 * The day's cards settle in when the user picks a different day. Signed travel,
 * because the strip is a timeline: a later day arrives from the right, an
 * earlier one from the left. Module scope, per Reanimated's builder rule.
 */
const DAY_CONTENT_SLIDE = 10;

const slideFrom = (from: number) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateX: from }] },
    100: {
      opacity: 1,
      transform: [{ translateX: 0 }],
      easing: KEYFRAME_EASE_OUT,
    },
  }).duration(DURATION.swap);

/** Forward in the week: the new cards come in from the right. */
const dayContentForward = slideFrom(DAY_CONTENT_SLIDE);
const dayContentBackward = slideFrom(-DAY_CONTENT_SLIDE);

/** Web avoids Keyframe's scroll-stale position snapshot; reduced motion drops travel. */
const dayContentFading = FadeIn.duration(DURATION.swap);

/** `undefined` until a day is actually switched: the motion belongs to the
 * state change, not the page load. */
function dayContentAnimation(
  direction: number,
  reduceMotion: boolean,
): EntryOrExitLayoutType | undefined {
  if (direction === 0) return undefined;
  if (reduceMotion || Platform.OS === 'web') return dayContentFading;
  return direction > 0 ? dayContentForward : dayContentBackward;
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

function newDate(): Date {
  return new Date();
}

export function UpNextSection({
  onItemPress,
  onItemActions,
}: UpNextSectionProps) {
  // State, not an ambient `new Date()`: React Compiler caches that together
  // with the split computed from it until the query data changes, which froze
  // the sections (and the strip's "today") between refetches.
  const [now, refreshNow] = useReducer(newDate, undefined, newDate);
  const { continueWatching, calendar } = useUpNextSections(now);
  useWakeAt(nextSplitChange(calendar, now), now, refreshNow);
  const [selectedOffset, setSelectedOffset] = useState(0);
  /** 0 until the first switch, then +1 for a later day and -1 for an earlier. */
  const [direction, setDirection] = useState(0);
  const reduceMotion = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const cardRailHeight = episodeCardRailHeight(fontScale);

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
  // What a streaming refetch adds after the first render rises in, at the
  // outermost level that is new: the section, else the Continue Watching
  // block, else the card.
  const [startedEmpty] = useState(continueWatching.length === 0 && calendar.length === 0);
  const [hadContinueWatching] = useState(continueWatching.length > 0);
  const arrivalHistory = useArrivalHistory([
    ...continueWatching.map((entry) => entry.item.id),
    ...week.flatMap((day) => day.groups.map((group) => group.id)),
  ]);

  if (continueWatching.length === 0 && calendar.length === 0) return null;

  const selected = week.find((day) => day.offset === selectedOffset) ?? week[0];

  const Root = startedEmpty ? SectionEnter : View;
  const ContinueWatchingRise =
    hadContinueWatching || startedEmpty ? Fragment : SectionEnter;

  return (
    <Root>
      {continueWatching.length > 0 && (
        // The last card's own exit can't play once the whole block unmounts
        // with it, so the block carries the same fade.
        <AnimatedView exiting={CARD_EXIT}>
          <ContinueWatchingRise>
            <CollapsibleSection
              collapseKey="up-next-continue"
              leading={<CollapsibleSection.Icon name="play-circle-outline" />}
              title="Continue Watching"
            >
              <VirtualizedRail
                // Horizontal Legend List padding does not offset items on web.
                // Spacers match the header's px-4; CardSlot already adds mr-3.
                // See docs/solutions/legend-list-horizontal-content-padding-web.md.
                ListHeaderComponent={<View className="w-4" />}
                ListFooterComponent={<View className="w-1" />}
                data={continueWatching}
                estimatedItemSize={268}
                // Show keys keep the visible card mounted when quick-log advances it.
                keyExtractor={(entry) => entry.item.id}
                style={{ height: cardRailHeight }}
                renderItem={({ item: entry }) => (
                  <CardSlot
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
                    arrival={hadContinueWatching ? { id: entry.item.id, seen: arrivalHistory } : undefined}
                    onActionsPress={onItemActions}
                    onPress={onItemPress}
                  />
                )}
              />
            </CollapsibleSection>
          </ContinueWatchingRise>
        </AnimatedView>
      )}

      <CollapsibleSection
        collapseKey="up-next-calendar"
        leading={<CollapsibleSection.Icon name="calendar-outline" />}
        title="This week"
      >
        <WeekStrip
          days={week}
          selectedOffset={selected.offset}
          onChange={(offset) => {
            setDirection(offset > selectedOffset ? 1 : -1);
            setSelectedOffset(offset);
          }}
        />

        {/* Empty and populated days reserve the same bounded list height. */}
        <View
          className="mt-3"
          style={{ minHeight: episodeCardRailHeight(fontScale, STACK_HEADROOM) }}
        >
          {/* Populated days remount to replay the enter; empty days keep their
              message mounted so it can morph. No block exit: an outgoing copy
              would sit in flow beside the incoming one and shift the feed. */}
          <AnimatedView
            key={selected.groups.length === 0 ? 'empty' : selected.offset}
            className="flex-1"
            entering={dayContentAnimation(direction, reduceMotion)}
          >
            {selected.groups.length === 0 ? (
              // Centered in the reserved space so the empty day reads as a
              // deliberate state, not a layout gap. The 忍 mark renders in the
              // OS fallback font (neither app family ships kanji, AGENTS.md
              // Theming).
              <View className="flex-1 items-center justify-center px-4">
                <Text className="text-muted/40 text-4xl mb-2">忍</Text>
                <MorphText
                  className="text-muted font-sans text-sm text-center"
                  // Native glyph rows cannot wrap at enlarged system text sizes.
                  numberOfLines={fontScale > 1 ? 0 : undefined}
                >
                  {emptyDayCopy(selected.offset, selected.label)}
                </MorphText>
              </View>
            ) : (
              <VirtualizedRail
                // The top padding is the stack headroom: a grouped card's backs
                // sit above its face card, and a horizontal scroll view clips at
                // its own frame.
                contentContainerStyle={{
                  paddingTop: STACK_HEADROOM,
                }}
                ListHeaderComponent={<View className="w-4" />}
                ListFooterComponent={<View className="w-1" />}
                data={selected.groups}
                estimatedItemSize={268}
                keyExtractor={(group) => group.id}
                style={{ height: episodeCardRailHeight(fontScale, STACK_HEADROOM) }}
                renderItem={({ item: group }) => (
                  <CardSlot
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
                    arrival={!startedEmpty ? { id: group.id, seen: arrivalHistory } : undefined}
                    onActionsPress={onItemActions}
                    onPress={onItemPress}
                  />
                )}
              />
            )}
          </AnimatedView>
        </View>
      </CollapsibleSection>
    </Root>
  );
}
