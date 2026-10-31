import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { GestureScrollView } from '@/components/animated-view';
import Head from '@/components/head';
import { SegmentedControl } from '@/components/segmented-control';
import { ComingSoonRow } from '@/features/up-next/coming-soon-row';
import type { SerializdUpcomingEpisode } from '@/lib/providers/serializd/upcoming';
import { routes } from '@/lib/routes';
import { localDayAt } from '@/lib/time/relative-day';
import { serializdQueryKeys } from '@/state/queries/serializd';

const tmdb = (path: string) => `https://image.tmdb.org/t/p/w780${path}`;
/** Local `YYYY-MM-DD`, `offset` days from today: Serializd's bare air date. */
function day(offset: number): string {
  const date = localDayAt(offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function episode(showId: number, title: string, fields: Partial<SerializdUpcomingEpisode> & { cover?: string }): SerializdUpcomingEpisode {
  const { cover = '/o2Oyi3boT100bY5kCP4MBiTeetO.jpg', ...rest } = fields;
  return {
    item: {
      id: `tmdb-tv-${showId}`, title, type: 'TV', currentProgress: 0, progressUnit: 'episode',
      coverImage: cover === '' ? '' : `https://image.tmdb.org/t/p/w342${cover}`, backdropImage: '',
      lastUpdated: new Date().toISOString(), externalIds: { tmdb: showId },
    },
    season: 1, number: 1, airDate: day(3), isPremiere: false, isFinale: false,
    ...rest,
  };
}

// The live signed-out payload (2026-10-31), re-dated to stay upcoming.
const DEMO = [
  episode(259909, 'Dexter: Resurrection', { season: 2, number: 1, title: 'Risky Business', airDate: day(1), isPremiere: true, still: tmdb('/iOxWqj1jM5ROPvlfKYHqvONdqVi.jpg') }),
  episode(213375, 'VisionQuest', { number: 7, title: 'Immolation', airDate: day(3), still: tmdb('/hhLuAHSGLZ5MSkN9UMjkhGu1zxN.jpg') }),
  episode(292741, 'Nocturne', { number: 3, title: 'Eyes on the Inside', airDate: day(5), still: tmdb('/zb9wrAzO5GV8Cx62Mi95K91VoOE.jpg') }),
];

// Serializd bounds none of these: names are TMDB strings, numbers are ints,
// and nothing promises one episode per show or a date within a year.
const DROP = Array.from({ length: 8 }, (_, index) =>
  episode(93405, 'Squid Game', { season: 3, number: index + 1, airDate: day(2), isPremiere: index === 0 }));
const WORST: SerializdUpcomingEpisode[] = [
  episode(71912, 'The Witcher', { season: 4, number: 8, title: 'Chapter Eight: Everything Ends, Everything Begins Anew in the Fires of the North', airDate: day(0), isFinale: true }),
  ...DROP,
  episode(84773, 'The Lord of the Rings: The Rings of Power', { season: 0, number: 0, airDate: day(4), cover: '' }),
  episode(209867, '葬送のフリーレン', { season: 2, number: 1, title: '冒険の終わり、そして新しい旅の始まり', airDate: day(6), isPremiere: true }),
  episode(120089, 'جن', { season: 2, number: 1, airDate: day(9), isPremiere: true }),
  episode(37854, 'One Piece', { season: 22, number: 1123, airDate: day(10) }),
  episode(1396, 'Breaking Bad', { airDate: day(-1), title: 'Aired yesterday' }),
  episode(100088, 'The Last of Us', { season: 3, number: 1, airDate: day(370), isPremiere: true }),
];

const STATES = { demo: DEMO, worst: WORST, empty: [], one: WORST.slice(0, 1), many: Array.from({ length: 1000 }, (_, index) => {
  const base = WORST[index % WORST.length]!;
  return { ...base, item: { ...base.item, id: `tmdb-tv-${index + 1}` }, airDate: day(index % 400) };
}) };
type State = keyof typeof STATES;

/** Dev-only stress preview of the Coming Soon row; fixtures enter through its query cache. */
export default function ComingSoonDemo() {
  const { data = 'demo' } = useLocalSearchParams<{ data?: State }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  if (!__DEV__) return <Redirect href={routes.home} />;
  const username = `demo-${data}`;
  // Seeded before the row's suspense query reads it; never fetched (staleTime).
  if (queryClient.getQueryData(serializdQueryKeys.upcoming(username)) == null) {
    queryClient.setQueryData(serializdQueryKeys.upcoming(username), STATES[data] ?? DEMO);
  }
  return (
    <>
      <Head><title>Coming Soon cards — Shinobu</title></Head>
      <GestureScrollView contentContainerClassName="pt-8 pb-48 gap-4">
        <Text className="text-muted font-sans text-sm mx-4">Before row</Text>
        <ComingSoonRow key={data} onItemActions={() => {}} onItemPress={() => {}} username={username} />
        <Text className="text-muted font-sans text-sm mx-4">After row</Text>
      </GestureScrollView>
      <View className="absolute bottom-6 left-4 right-4 max-w-xl self-center">
        <SegmentedControl
          accessibilityLabel="Preview data"
          onChange={(next) => router.setParams({ data: next })}
          options={[{ value: 'demo', label: 'Demo' }, { value: 'worst', label: 'Worst' }, { value: 'empty', label: 'Empty' }, { value: 'one', label: 'One' }, { value: 'many', label: '1,000' }]}
          value={data}
        />
      </View>
    </>
  );
}
