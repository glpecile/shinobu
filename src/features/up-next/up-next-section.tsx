import { Fragment, useReducer, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';
import {
  FadeIn,
  Keyframe,
  useReducedMotion,
  type EntryOrExitLayoutType,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { MorphText } from '@/components/morph-text';
import { calendarBadges, continueWatchingBadges } from '@/features/up-next/badges';
import { calendarWeek, nextSplitChange } from '@/features/up-next/compute';
import { groupDayEntries, soloGroup } from '@/features/up-next/group';
import { useUpNextSections } from '@/features/up-next/use-up-next-sections';
import { CARD_EXIT } from '@/features/up-next/ui/card-slot';
import { EpisodeCardRail, STACK_HEADROOM } from '@/features/up-next/ui/episode-card-rail';
import { episodeCardRailHeight } from '@/features/up-next/ui/metrics';
import { QuickLogButton } from '@/features/up-next/ui/quick-log-button';
import { WeekStrip } from '@/features/up-next/ui/week-strip';
import { CollapsibleSection } from '@/components/collapsible-section';
import { SectionEnter, useArrivalHistory } from '@/components/section-enter';
import { DURATION, KEYFRAME_EASE_OUT } from '@/lib/motion';
import { useWakeAt } from '@/lib/time/use-wake-at';
import type { NormalizedMediaItem } from '@/types/media';

export interface UpNextSectionProps {
  onItemPress: (item: NormalizedMediaItem) => void;
  onItemActions: (item: NormalizedMediaItem) => void;
}

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

const dayContentForward = slideFrom(DAY_CONTENT_SLIDE);
const dayContentBackward = slideFrom(-DAY_CONTENT_SLIDE);

/** Web avoids Reanimated Keyframe's scroll-stale position snapshot. */
const dayContentFading = FadeIn.duration(DURATION.swap);

function dayContentAnimation(
  direction: number,
  reduceMotion: boolean,
): EntryOrExitLayoutType | undefined {
  if (direction === 0) return undefined;
  if (reduceMotion || Platform.OS === 'web') return dayContentFading;
  return direction > 0 ? dayContentForward : dayContentBackward;
}

function emptyDayCopy(offset: number, label: string): string {
  if (offset === 0) return "That’s all for today.";
  if (offset === 1) return 'Nothing airing tomorrow.';
  return `Nothing airing on ${label}.`;
}

function newDate(): Date {
  return new Date();
}

export function UpNextSection({ onItemPress, onItemActions }: UpNextSectionProps) {
  // State, not an ambient `new Date()`: React Compiler caches that together
  // with the split computed from it until the query data changes, which froze
  // the sections (and the strip's "today") between refetches.
  const [now, refreshNow] = useReducer(newDate, undefined, newDate);
  const { continueWatching, calendar } = useUpNextSections(now);
  useWakeAt(nextSplitChange(calendar, now), now, refreshNow);
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [direction, setDirection] = useState(0);
  const reduceMotion = useReducedMotion();
  const { fontScale } = useWindowDimensions();

  const week = calendarWeek([...continueWatching, ...calendar], now).map((day) => ({
    ...day,
    groups: groupDayEntries(day.entries),
  }));
  const [startedEmpty] = useState(continueWatching.length === 0 && calendar.length === 0);
  const [hadContinueWatching] = useState(continueWatching.length > 0);
  const arrivalHistory = useArrivalHistory([
    ...continueWatching.map((entry) => entry.item.id),
    ...week.flatMap((day) => day.groups.map((group) => group.id)),
  ]);

  if (continueWatching.length === 0 && calendar.length === 0) return null;

  const selected = week.find((day) => day.offset === selectedOffset) ?? week[0];

  const Root = startedEmpty ? SectionEnter : View;
  const ContinueWatchingRise = hadContinueWatching || startedEmpty ? Fragment : SectionEnter;

  return (
    <Root>
      {continueWatching.length > 0 && (
        <AnimatedView exiting={CARD_EXIT}>
          <ContinueWatchingRise>
            <CollapsibleSection
              collapseKey="up-next-continue"
              leading={<CollapsibleSection.Icon name="play-circle-outline" />}
              title="Continue Watching"
            >
              <EpisodeCardRail
                action={(group) =>
                  group.lead.kind === 'episode' ? <QuickLogButton entry={group.lead} /> : undefined
                }
                arrival={
                  hadContinueWatching
                    ? (group) => ({ id: group.lead.item.id, seen: arrivalHistory })
                    : undefined
                }
                badges={(group) => continueWatchingBadges(group.lead, now)}
                groups={continueWatching.map(soloGroup)}
                onActionsPress={onItemActions}
                onPress={onItemPress}
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

        <View
          className="mt-3"
          style={{ minHeight: episodeCardRailHeight(fontScale, STACK_HEADROOM) }}
        >
          <AnimatedView
            key={selected.groups.length === 0 ? 'empty' : selected.offset}
            className="flex-1"
            entering={dayContentAnimation(direction, reduceMotion)}
          >
            {selected.groups.length === 0 ? (
              <View className="pointer-fine:pb-3">
                <View
                  className="items-center justify-center px-4"
                  style={{ minHeight: episodeCardRailHeight(fontScale, STACK_HEADROOM) }}
                >
                  <Text className="text-muted/40 text-4xl mb-2">忍</Text>
                  <MorphText
                    className="text-muted font-sans text-sm text-center"
                    numberOfLines={fontScale > 1 ? 0 : undefined}
                  >
                    {emptyDayCopy(selected.offset, selected.label)}
                  </MorphText>
                </View>
              </View>
            ) : (
              <EpisodeCardRail
                action={(group) =>
                  group.entries.length === 1 &&
                  group.lead.status === 'aired' &&
                  group.lead.kind === 'episode' ? (
                    <QuickLogButton entry={group.lead} />
                  ) : undefined
                }
                arrival={
                  !startedEmpty ? (group) => ({ id: group.id, seen: arrivalHistory }) : undefined
                }
                badges={(group) =>
                  group.lead.status === 'aired'
                    ? continueWatchingBadges(group.lead, now)
                    : calendarBadges(group.lead, now)
                }
                groups={selected.groups}
                onActionsPress={onItemActions}
                onPress={onItemPress}
                stacked
              />
            )}
          </AnimatedView>
        </View>
      </CollapsibleSection>
    </Root>
  );
}
