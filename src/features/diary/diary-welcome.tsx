import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
// oxlint-disable-next-line no-restricted-imports -- one composed colour, see the fade.
import { useCSSVariable } from 'uniwind';

import { ConnectTrackerButton } from '@/components/connect-tracker-button';
import { GestureScrollView } from '@/components/animated-view';
import { COPY_STAGGER, HeroEnter, HeroProviders } from '@/components/hero-enter';
import type { ProviderId } from '@/lib/providers/types';
import { tmdbImageUrl } from '@/lib/providers/tmdb/config';
import type { DiaryDay, MediaType, MergedDiaryEntry } from '@/types/media';

import { DiaryList } from './diary-list';
import { dayKeyForInstant } from './merge';

/** One log lands per beat until the evening is complete, which then holds. */
const BEAT = 1800;

/**
 * The diary before any tracker is connected: the real list (calendar
 * included), faded and inert, fed sample logs that land one by one as if
 * someone were logging tonight's binge. Progress is state, so leaving the tab
 * pauses it and coming back resumes it; it never rewinds while mounted. Being the real list, the
 * sample follows every change to the diary's design. Phones anchor the copy
 * low for thumb reach; wide screens centre it left of the sample, as Home does.
 */
export function DiaryWelcome({ timeZone }: { timeZone: string }) {
  // `useCSSVariable`, not `useThemeColor`: the fades compose a transparent stop.
  const background = useCSSVariable('--color-background');
  const wide = useWindowDimensions().width >= 768;
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const done = step >= LIVE.length;

  useEffect(() => {
    if (!focused || reduceMotion || done) return;
    const timer = setInterval(() => setStep((current) => current + 1), BEAT);
    return () => clearInterval(timer);
  }, [focused, reduceMotion, done]);

  const landed = reduceMotion ? LIVE.length : Math.min(step, LIVE.length);
  const fade = typeof background === 'string' ? background : null;

  return (
    <View className="flex-1 overflow-hidden">
      {/* Wide screens pin the sample to the right edge, the copy to the left. */}
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        {...(Platform.OS === 'web' ? { inert: true } : {})}
        className="absolute inset-0 opacity-75"
        style={[{ pointerEvents: 'none' }, wide && { left: 'auto', width: '70%', maxWidth: 960 }]}
      >
        <DiaryList
          days={sampleDiaryDays(new Date(), timeZone, landed)}
          failedProviders={[]}
          format="ALL"
          hasNextPage={false}
          isFetchingNextPage={false}
          onEndReached={() => {}}
          onItemActions={() => {}}
          onOpen={() => {}}
          onRefresh={async () => {}}
          onRetry={() => {}}
          timeZone={timeZone}
        />
        {wide && fade != null && (
          <LinearGradient
            colors={[fade, `${fade}00`]}
            end={{ x: 0.25, y: 0.5 }}
            start={{ x: 0, y: 0.5 }}
            style={{ position: 'absolute', inset: 0 }}
          />
        )}
      </View>
      {!wide && fade != null && (
        <LinearGradient
          colors={[`${fade}00`, `${fade}E6`, fade]}
          locations={[0.2, 0.55, 0.75]}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        />
      )}
      <GestureScrollView className="flex-1" contentContainerClassName="grow justify-end md:justify-center">
        <View className="w-full max-w-2xl px-6 pt-4 pb-8 ios:pb-28 md:px-16 md:pb-0">
          <HeroEnter className="mb-5">
            <HeroProviders />
          </HeroEnter>
          <HeroEnter delay={COPY_STAGGER}>
            <Text
              accessibilityRole="header"
              className="font-display text-foreground tracking-tight text-4xl md:text-6xl"
            >
              {'Every watch,\nday by day.'}
            </Text>
          </HeroEnter>
          <HeroEnter className="mt-3 md:mt-5" delay={COPY_STAGGER * 2}>
            <Text className="font-sans text-muted text-base leading-relaxed md:max-w-md">
              Connect a tracker and everything you've logged, in Shinobu or on the tracker itself,
              lands here in one diary.
            </Text>
          </HeroEnter>
          <HeroEnter className="mt-6 self-stretch md:self-start" delay={COPY_STAGGER * 3}>
            <ConnectTrackerButton />
          </HeroEnter>
        </View>
      </GestureScrollView>
    </View>
  );
}

/** Real TMDB posters; ids keep the shape the list expects. */
interface SampleLog {
  tmdb: number;
  type: MediaType;
  title: string;
  poster: string;
  providers: ProviderId[];
  season?: number;
  episode?: number;
  liked?: boolean;
}

const BEBOP = { tmdb: 30991, type: 'TV', title: 'Cowboy Bebop', poster: '/xDiXDfZwC6XYC6fxHI1jl3A3Ill.jpg', providers: ['simkl', 'trakt'], season: 1 } as const;

const bebop = (episode: number): SampleLog => ({ ...BEBOP, providers: [...BEBOP.providers], episode });

/** Tonight's logs, in the order they land: a film, then a binge with a break. */
const LIVE: SampleLog[] = [
  { tmdb: 78, type: 'MOVIE', title: 'Blade Runner', poster: '/63N9uy8nd9j7Eog2axPQ8lbr3Wj.jpg', providers: ['letterboxd', 'trakt'], liked: true },
  ...Array.from({ length: 13 }, (_, index) => bebop(index + 1)),
  { tmdb: 603, type: 'MOVIE', title: 'The Matrix', poster: '/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg', providers: ['letterboxd', 'trakt'] },
  ...Array.from({ length: 13 }, (_, index) => bebop(index + 14)),
];

const HISTORY: (SampleLog & { daysAgo: number; hour: number })[] = [
  { daysAgo: 2, hour: 20, tmdb: 129, type: 'MOVIE', title: 'Spirited Away', poster: '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', providers: ['letterboxd', 'simkl'], liked: true },
  { daysAgo: 2, hour: 1, tmdb: 890, type: 'TV', title: 'Neon Genesis Evangelion', poster: '/y2ah9t0navXyIvoHg1uIbIHO3tt.jpg', providers: ['anilist'], season: 1, episode: 26 },
  { daysAgo: 4, hour: 22, tmdb: 149, type: 'MOVIE', title: 'Akira', poster: '/neZ0ykEsPqxamsX6o5QNUFILQrz.jpg', providers: ['letterboxd'] },
  { daysAgo: 6, hour: 21, tmdb: 10494, type: 'MOVIE', title: 'Perfect Blue', poster: '/6WTiOCfDPP8XV4jqfloiVWf7KHq.jpg', providers: ['trakt', 'simkl'] },
  { daysAgo: 9, hour: 20, tmdb: 8392, type: 'MOVIE', title: 'My Neighbor Totoro', poster: '/rtGDOeG9LzoerkDGZF9dnVeLppL.jpg', providers: ['letterboxd'], liked: true },
  { daysAgo: 12, hour: 23, tmdb: 9323, type: 'MOVIE', title: 'Ghost in the Shell', poster: '/9gC88zYUBARRSThcG93MvW14sqx.jpg', providers: ['trakt'] },
  { daysAgo: 15, hour: 22, tmdb: 128, type: 'MOVIE', title: 'Princess Mononoke', poster: '/cMYCDADoLKLbB83g4WnJegaZimC.jpg', providers: ['letterboxd', 'simkl'] },
  { daysAgo: 18, hour: 21, tmdb: 603, type: 'MOVIE', title: 'The Matrix', poster: '/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg', providers: ['trakt'] },
  { daysAgo: 21, hour: 20, tmdb: 238, type: 'MOVIE', title: 'The Godfather', poster: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', providers: ['letterboxd'], liked: true },
];

function sampleEntry(log: SampleLog, id: string, at: Date): MergedDiaryEntry {
  const kind = log.type === 'MOVIE' ? 'movie' : 'tv';
  return {
    id,
    providers: log.providers,
    item: {
      id: `tmdb-${kind}-${log.tmdb}`,
      title: log.title,
      coverImage: tmdbImageUrl(log.poster, 'w342'),
      type: log.type,
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: at.toISOString(),
      externalIds: { tmdb: log.tmdb },
    },
    episodes: log.episode != null ? [log.episode] : [],
    ...(log.season != null ? { season: log.season } : {}),
    watchedAt: at.toISOString(),
    dateOnly: false,
    ...(log.liked === true ? { liked: true } : {}),
  };
}

/** Three weeks of past logs, plus the first `landed` of tonight's, newest first. */
function sampleDiaryDays(now: Date, timeZone: string, landed: number): DiaryDay[] {
  const tonight = LIVE.slice(0, landed)
    // Spaced back from now so the last to land is the newest.
    .map((log, index) => sampleEntry(log, `live-${index}`, new Date(now.getTime() - (landed - index) * 5 * 60_000)))
    .toReversed();
  const days = new Map<string, MergedDiaryEntry[]>();
  for (const entry of tonight) {
    const key = dayKeyForInstant(new Date(entry.watchedAt), timeZone);
    days.set(key, [...(days.get(key) ?? []), entry]);
  }
  for (const [index, log] of HISTORY.entries()) {
    const at = new Date(now);
    at.setDate(at.getDate() - log.daysAgo);
    at.setHours(log.hour, 0, 0, 0);
    const key = dayKeyForInstant(at, timeZone);
    days.set(key, [...(days.get(key) ?? []), sampleEntry(log, `history-${index}`, at)]);
  }
  return [...days].map(([key, entries]) => ({ key, entries }));
}
