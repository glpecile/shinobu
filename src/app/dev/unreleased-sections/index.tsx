import { useEffect, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Eyebrow } from '@/components/eyebrow';
import { MorphText } from '@/components/morph-text';
import { PresstableOpacity } from '@/components/presstable';
import { Section } from '@/components/section';
import { StatTile } from '@/components/stat-tile';
import { formatAirDate } from '@/features/episode-details/episode-label';
import { hasStartedAiring } from '@/features/log-media/release-gate';
import { ReleaseTimeline } from '@/features/release-timeline/release-timeline';
import { releaseStops } from '@/features/release-timeline/stops';
import { SeasonHeader } from '@/features/show-seasons/season-accordion';
import { formatRuntime } from '@/features/show-seasons/runtime';
import { formatRelativeDay } from '@/lib/time/relative-day';
import type { NormalizedMediaItem, NormalizedSeason } from '@/types/media';

/**
 * State machine for variant D (upcoming tile) — one component, one state on
 * screen, `__state` in the URL. The component under test is the details
 * screen's progress/seasons block with the D rule applied: before anything
 * airs, the 0/total tile becomes a premiere countdown and empty seasons stay
 * hidden. Everything is a mock: fixtures below feed the real `StatTile`,
 * `SeasonHeader`, and `ReleaseTimeline` at their props, and this route gets
 * deleted once D ships for real.
 */

type StateKey =
  | 'series-dated'
  | 'series-undated'
  | 'series-today'
  | 'series-tomorrow'
  | 'series-airing'
  | 'movie-dated'
  | 'movie-undated'
  | 'movie-staggered';

const STATES: Array<{ key: StateKey; group: string; label: string }> = [
  { key: 'series-dated', group: 'Anime series', label: 'Dated premiere' },
  { key: 'series-undated', group: 'Anime series', label: 'No date anywhere' },
  { key: 'series-today', group: 'Anime series', label: 'Premieres today' },
  { key: 'series-tomorrow', group: 'Anime series', label: 'Premieres tomorrow' },
  { key: 'series-airing', group: 'Anime series', label: 'Airing (control)' },
  { key: 'movie-dated', group: 'Movie', label: 'Dated theatrical' },
  { key: 'movie-undated', group: 'Movie', label: 'No date anywhere' },
  { key: 'movie-staggered', group: 'Movie', label: 'Theatrical out, digital pending' },
];

/** Opens on the gap: the undated case is the open question. */
const DEFAULT_STATE: StateKey = 'series-undated';

interface Fixture {
  item: NormalizedMediaItem;
  seasons: NormalizedSeason[];
  /** Logged count for the started-airing control. */
  progress: number;
  /** Fixture facts — what this state is. */
  blurb: string;
  /** What the D rule renders for it. */
  outcome: string;
}

function isoDay(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

function seriesItem(overrides: Partial<NormalizedMediaItem>): NormalizedMediaItem {
  return {
    id: 'anilist-1',
    title: 'Fixture',
    coverImage: '',
    type: 'ANIME',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: new Date().toISOString(),
    externalIds: {},
    ...overrides,
  };
}

function movieItem(overrides: Partial<NormalizedMediaItem>): NormalizedMediaItem {
  return {
    id: 'tmdb-1',
    title: 'Fixture',
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: new Date().toISOString(),
    externalIds: {},
    ...overrides,
  };
}

const FIXTURES: Record<StateKey, Fixture> = {
  'series-dated': {
    item: seriesItem({
      id: 'anilist-21460',
      title: 'Frieren: Beyond Journey’s End',
      releaseDate: isoDay(20),
      year: new Date(isoDay(20)).getFullYear(),
      totalEpisodes: 12,
      runtime: 24,
    }),
    seasons: [
      {
        number: 1,
        title: 'Episodes',
        episodes: [
          { number: 1, title: 'The Journey Continues', firstAired: isoDay(20), runtime: 24 },
          { number: 2, title: 'TBA', runtime: 24 },
          { number: 3, title: 'TBA', runtime: 24 },
        ],
      },
    ],
    progress: 0,
    blurb: 'Sequel with a premiere date · nothing logged · episodes 2+ undated.',
    outcome: 'Premieres tile (“In 20 days”); no seasons.',
  },
  'series-undated': {
    item: seriesItem({
      id: 'anilist-170942',
      title: 'The Apothecary Diaries',
      totalEpisodes: 12,
      runtime: 24,
    }),
    seasons: [
      {
        number: 1,
        title: 'Episodes',
        episodes: [
          { number: 1, title: 'TBA' },
          { number: 2, title: 'TBA' },
        ],
      },
    ],
    progress: 0,
    blurb: 'Sequel announced, no date anywhere, episodes undated.',
    outcome: 'Nothing — no date, no countdown. This is the gap.',
  },
  'series-today': {
    item: seriesItem({
      id: 'anilist-21460',
      title: 'Frieren: Beyond Journey’s End',
      releaseDate: isoDay(0),
      year: new Date().getFullYear(),
      totalEpisodes: 12,
      runtime: 24,
    }),
    seasons: [
      {
        number: 1,
        title: 'Episodes',
        episodes: [{ number: 1, title: 'The Journey Continues', firstAired: isoDay(0), runtime: 24 }],
      },
    ],
    progress: 0,
    blurb: 'Premieres today — a bare date parses as local midnight, already passed.',
    outcome: 'D switches off: today counts as started, so normal 0/12 + season appear.',
  },
  'series-tomorrow': {
    item: seriesItem({
      id: 'anilist-21460',
      title: 'Frieren: Beyond Journey’s End',
      releaseDate: isoDay(1),
      year: new Date(isoDay(1)).getFullYear(),
      totalEpisodes: 12,
      runtime: 24,
    }),
    seasons: [
      {
        number: 1,
        title: 'Episodes',
        episodes: [{ number: 1, title: 'The Journey Continues', firstAired: isoDay(1), runtime: 24 }],
      },
    ],
    progress: 0,
    blurb: 'Premieres tomorrow · nothing logged.',
    outcome: 'Premieres tile (“Tomorrow”); no seasons.',
  },
  'series-airing': {
    item: seriesItem({
      id: 'anilist-21460',
      title: 'Frieren: Beyond Journey’s End',
      releaseDate: isoDay(-14),
      year: new Date(isoDay(-14)).getFullYear(),
      totalEpisodes: 12,
      runtime: 24,
      currentProgress: 2,
    }),
    seasons: [
      {
        number: 1,
        title: 'Episodes',
        episodes: [
          { number: 1, title: 'The Journey Continues', firstAired: isoDay(-14), runtime: 24 },
          { number: 2, title: 'The Second Door', firstAired: isoDay(-7), runtime: 24 },
          { number: 3, title: 'TBA', firstAired: isoDay(0), runtime: 24 },
          { number: 4, title: 'TBA', firstAired: isoDay(7), runtime: 24 },
        ],
      },
    ],
    progress: 2,
    blurb: 'Two episodes out, both logged. Control: D must be off here.',
    outcome: 'Normal progress (2/12) + total time + seasons.',
  },
  'movie-dated': {
    item: movieItem({
      id: 'tmdb-999999',
      title: 'Demon Slayer: Kimetsu no Yaiba – Infinity Castle',
      releaseDate: isoDay(30),
      year: new Date(isoDay(30)).getFullYear(),
      releaseCalendar: { theatrical: isoDay(30), digital: isoDay(120) },
    }),
    seasons: [],
    progress: 0,
    blurb: 'Theatrical in 30 days, digital later · nothing logged.',
    outcome: 'D changes nothing: progress already hidden for unlogged films; the rail owns the dates. Judge the rail.',
  },
  'movie-undated': {
    item: movieItem({ id: 'tmdb-888888', title: 'Untitled Mamoru Hosoda film' }),
    seasons: [],
    progress: 0,
    blurb: 'Announced project, no dates anywhere.',
    outcome: 'Nothing — timeline empty, progress hidden. Collapses.',
  },
  'movie-staggered': {
    item: movieItem({
      id: 'tmdb-999999',
      title: 'Demon Slayer: Kimetsu no Yaiba – Infinity Castle',
      releaseDate: isoDay(-10),
      year: new Date(isoDay(-10)).getFullYear(),
      releaseCalendar: { theatrical: isoDay(-10), digital: isoDay(20), physical: isoDay(45) },
    }),
    seasons: [],
    progress: 0,
    blurb: 'Out in theaters, home release pending · nothing logged.',
    outcome: 'Rail mixes past + upcoming stops. Proposal: D leaves this alone.',
  },
};

/** Production renders nothing — the space collapses. */
function CollapseNote() {
  return (
    <Text className="text-muted font-sans text-sm">
      Nothing renders — this space collapses.
    </Text>
  );
}

/** Mirrors the details screen's 0/total tile so the control reads true. */
function ProgressValue({ progress, total }: { progress: number; total: number }) {
  return (
    <View className="flex-row items-baseline mt-0.5">
      <MorphText className="text-foreground text-2xl font-sans-semibold">
        {Math.min(progress, total)}
      </MorphText>
      <Text className="text-muted text-2xl font-sans-semibold">{` / ${total}`}</Text>
    </View>
  );
}

function SeasonRow({ season }: { season: NormalizedSeason }) {
  const [open, setOpen] = useState(false);
  return <SeasonHeader onToggle={() => setOpen((value) => !value)} open={open} season={season} />;
}

/**
 * The D rule, as it would ship: films keep production behavior (the film rule
 * already hides unlogged progress, the timeline owns its dates); a series
 * that started airing renders normally; a dated pre-airing series gets the
 * countdown tile with seasons hidden; an undated one collapses.
 */
function UpcomingBlock({ fixture }: { fixture: Fixture }) {
  const { item, seasons, progress } = fixture;
  if (item.type === 'MOVIE') {
    if (releaseStops(item.releaseCalendar).length === 0) return <CollapseNote />;
    return <ReleaseTimeline item={item} />;
  }
  const episodes = seasons.flatMap((season) => season.episodes);
  if (hasStartedAiring(item, episodes)) {
    return (
      <View>
        <View className="flex-row gap-4">
          <StatTile
            caption="episodes"
            label="Progress"
            value={<ProgressValue progress={progress} total={item.totalEpisodes ?? progress} />}
          />
          {item.totalEpisodes != null && item.runtime != null && (
            <StatTile
              caption={`${item.runtime}m each`}
              label="Total time"
              value={formatRuntime(item.totalEpisodes * item.runtime)}
            />
          )}
        </View>
        <View className="mt-6">
          <Section>
            <Section.Header>
              <Section.Title>Seasons</Section.Title>
            </Section.Header>
            {seasons.map((season) => (
              <SeasonRow key={season.number} season={season} />
            ))}
          </Section>
        </View>
      </View>
    );
  }
  if (item.releaseDate == null) return <CollapseNote />;
  const countdown = formatRelativeDay(item.releaseDate);
  if (countdown == null) return <CollapseNote />;
  return (
    <View className="flex-row gap-4">
      <StatTile
        caption={`First episode · ${formatAirDate(item.releaseDate)}`}
        label="Premieres"
        value={countdown}
      />
    </View>
  );
}

const CHROME_FONT = 'system-ui, -apple-system, sans-serif';

/** Deliberately outside the design system: dark neutral chrome, no tokens. */
function StateSwitcher({ active, onPick }: { active: StateKey; onPick: (key: StateKey) => void }) {
  const groups = STATES.reduce<Array<{ heading: string; keys: StateKey[] }>>((acc, state) => {
    const group = acc.find((entry) => entry.heading === state.group);
    if (group) group.keys.push(state.key);
    else acc.push({ heading: state.group, keys: [state.key] });
    return acc;
  }, []);
  const label = (key: StateKey) => STATES.find((state) => state.key === key)?.label ?? key;
  return (
    <View
      accessibilityLabel="States"
      style={{
        backgroundColor: 'rgba(20,20,20,0.92)',
        borderRadius: 14,
        padding: 6,
        gap: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
      }}
    >
      {groups.map((group) => (
        <View key={group.heading} style={{ gap: 2 }}>
          <Text
            style={{
              fontFamily: CHROME_FONT,
              fontSize: 11,
              fontWeight: '500',
              color: 'rgba(255,255,255,0.45)',
              paddingHorizontal: 10,
              paddingTop: 4,
              paddingBottom: 6,
            }}
          >
            {`→ ${group.heading}`}
          </Text>
          {group.keys.map((key) => {
            const selected = key === active;
            return (
              <PresstableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={key}
                onPress={() => onPick(key)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: selected ? 'rgba(255,255,255,0.14)' : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontFamily: CHROME_FONT,
                    fontSize: 13,
                    fontWeight: selected ? '500' : '400',
                    color: selected ? 'rgb(255,255,255)' : 'rgba(255,255,255,0.6)',
                  }}
                >
                  {label(key)}
                </Text>
              </PresstableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function UnreleasedSectionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ __state?: string }>();
  const raw = Array.isArray(params.__state) ? params.__state[0] : params.__state;
  const active: StateKey =
    STATES.some((state) => state.key === raw) ? (raw as StateKey) : DEFAULT_STATE;
  const [hidden, setHidden] = useState(false);
  const { width } = useWindowDimensions();
  // 208px switcher + 24px gap + the details column at production width.
  const wide = width >= 1128;

  useEffect(() => {
    if (process.env.EXPO_OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const index = STATES.findIndex((state) => state.key === active);
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        router.setParams({ __state: STATES[(index + 1) % STATES.length].key });
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        router.setParams({
          __state: STATES[(index - 1 + STATES.length) % STATES.length].key,
        });
      } else if (event.key === 'h' || event.key === 'H') {
        setHidden((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, router]);

  const fixture = FIXTURES[active];
  const stateLabel = STATES.find((state) => state.key === active)?.label ?? active;

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 py-8 self-center w-full" style={{ maxWidth: 920 }}>
        <Text className="text-foreground font-display text-2xl">Upcoming tile</Text>
        <Text className="text-muted font-sans text-sm mt-1 mb-6">
          Variant D across every pre-airing shape — one state on screen, __state in the URL (arrows
          step, H hides the switcher). Dropped: loading/error (suspense shells untouched) and
          account/feature (nothing branches on them here).
        </Text>
        <View style={wide ? { flexDirection: 'row', gap: 24 } : { flexDirection: 'column', gap: 16 }}>
          {!hidden && (
            <View style={wide ? { width: 208 } : undefined}>
              <StateSwitcher
                active={active}
                onPick={(key) => router.setParams({ __state: key })}
              />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Eyebrow>{stateLabel}</Eyebrow>
            <Text className="text-muted font-sans text-sm mt-1">{fixture.blurb}</Text>
            <Text className="text-foreground font-sans text-sm mt-1 mb-3">
              {`D renders: ${fixture.outcome}`}
            </Text>
            <View className="rounded-lg border border-border p-4">
              <UpcomingBlock fixture={fixture} />
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
