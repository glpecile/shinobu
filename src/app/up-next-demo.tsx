import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { Fab } from '@/components/fab';
import Head from '@/components/head';
import { List } from '@/components/List';
import { LikeButton } from '@/components/like-button';
import { VirtualizedRail } from '@/components/rail';
import { SegmentedControl } from '@/components/segmented-control';
import { ViewToggle } from '@/components/view-toggle';
import { continueWatchingBadges } from '@/features/up-next/badges';
import { calendarWeek } from '@/features/up-next/compute';
import { groupDayEntries, soloGroup } from '@/features/up-next/group';
import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import { CardSlot } from '@/features/up-next/ui/card-slot';
import { episodeCardRailHeight } from '@/features/up-next/ui/metrics';
import { WeekStrip } from '@/features/up-next/ui/week-strip';
import { routes } from '@/lib/routes';
import type { WatchlistView } from '@/state/prefs/watchlist-view';

const NOW = new Date('2026-10-12T12:00:00Z');
const artwork = (width: number, height: number) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="slategray"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="white"/></svg>`,
)}`;

const BASE: UpNextEpisodeEntry = {
  id: 'simkl-demo-1',
  kind: 'episode',
  status: 'aired',
  source: 'simkl',
  item: {
    id: 'simkl-demo-1', title: 'Link Click Season 3', type: 'ANIME',
    coverImage: artwork(640, 360), currentProgress: 2, progressUnit: 'episode',
    lastUpdated: NOW.toISOString(), externalIds: {},
  },
  episode: { number: 3, runtime: 21 },
  episodesBehind: 8,
};

const DEMO = ['Link Click Season 3', 'False Memory (2026)', 'The Apothecary Diaries'].map((title, index) => ({
  ...BASE, id: `simkl-demo-${index}`, item: { ...BASE.item, id: `simkl-demo-${index}`, title },
}));

// Normalized titles, episode names, image URLs and numeric metadata have no length bounds.
const WORST: UpNextEpisodeEntry[] = [
  { ...BASE, item: { ...BASE.item, title: 'I Was Reincarnated as the 7th Prince so I Can Take My Time Perfecting My Magical Ability' }, episode: { number: 1122, runtime: 104, title: 'The Last Battle! The Final Chapter of a Very Long Journey', firstAired: NOW.toISOString() }, episodesBehind: 1284 },
  { ...BASE, item: { ...BASE.item, title: 'Fate/staynightUnlimitedBladeWorks', coverImage: '', backdropImage: '' }, episode: { number: 1, title: '   ' }, episodesBehind: 1 },
  { ...BASE, item: { ...BASE.item, title: '進撃の巨人 The Final Season 完結編（後編） 🧙🏽‍♀️', coverImage: 'data:image/png;base64,broken' }, episode: { number: 16, runtime: 23 } },
  { ...BASE, item: { ...BASE.item, title: 'المحقق كونان — الحلقة الأخيرة', coverImage: artwork(200, 4000) } },
  { ...BASE, item: { ...BASE.item, title: '   ', coverImage: artwork(4000, 200) }, episode: { number: 1, title: '' }, episodesBehind: undefined },
  { ...BASE, item: { ...BASE.item, title: 'X', runtime: 25, coverImage: '', backdropImage: '' }, episode: { number: 0, runtime: 0 } },
  { ...BASE, item: { ...BASE.item, title: 'Đường về nhà — Ký ức &amp; **ước mơ**' }, episode: { number: 99, runtime: Number.NaN }, episodesBehind: Number.POSITIVE_INFINITY },
  { ...BASE, item: { ...BASE.item, title: 'Poster only', backdropImage: '' } },
].map((entry, index) => ({ ...entry, id: `simkl-worst-${index}`, item: { ...entry.item, id: `simkl-worst-${index}` } }));

/** Dev-only stress preview; actions never write to a provider. */
export default function UpNextDemo() {
  const { data = 'demo', state = 'ready' } = useLocalSearchParams<{ data?: string; state?: string }>();
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const [notice, setNotice] = useState('Preview actions do not log watches.');
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [liked, setLiked] = useState(false);
  const [view, setView] = useState<WatchlistView>('grid');
  if (!__DEV__) return <Redirect href={routes.home} />;
  let entries = DEMO;
  switch (data) {
    case 'worst': entries = WORST; break;
    case 'empty': entries = []; break;
    case 'one': entries = WORST.slice(0, 1); break;
    case 'many': entries = Array.from({ length: 1000 }, (_, index) => {
      const entry = WORST[index % WORST.length]!;
      return { ...entry, id: `simkl-many-${index}`, item: { ...entry.item, id: `simkl-many-${index}` } };
    }); break;
  }
  return (
    <>
      <Head><title>Continue Watching cards — Shinobu</title></Head>
      <List
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <View className="pt-8 pb-48 gap-4">
            <Text accessibilityRole="header" className="text-foreground font-display text-2xl mx-4">Continue Watching</Text>
            <VirtualizedRail
              key={data}
              data={entries}
              estimatedItemSize={268}
              keyExtractor={(entry) => entry.id}
              ListHeaderComponent={<View className="w-4" />}
              ListFooterComponent={<View className="w-1" />}
              ListEmptyComponent={<Text className="text-muted font-sans mx-4">No episodes to continue</Text>}
              renderItem={({ item: entry }) => (
                <CardSlot
                  action={<Fab icon="eye-outline" label={`Log episode ${entry.episode.number} of ${entry.item.title.trim() || 'Untitled'}`} loading={state === 'loading'} onPress={() => setNotice(`Log pressed: ${entry.item.title}`)} size="sm" />}
                  badges={continueWatchingBadges(entry, NOW)}
                  group={soloGroup(entry)}
                  onActionsPress={(item) => setNotice(`Options pressed: ${item.title}`)}
                  onPress={(item) => setNotice(`Card pressed: ${item.title}`)}
                />
              )}
              style={{ height: episodeCardRailHeight(fontScale) }}
            />
            <Text className="text-muted font-sans text-sm mx-4">After cards</Text>
            <Text accessibilityRole="header" className="text-foreground font-display text-xl mx-4">This week</Text>
            <WeekStrip days={calendarWeek(DEMO.map((entry, index) => ({ ...entry, episode: { ...entry.episode, firstAired: new Date(2026, 9, 12 + index, 12).toISOString() } })), NOW).map((day) => ({ ...day, groups: groupDayEntries(day.entries) }))} selectedOffset={selectedOffset} onChange={setSelectedOffset} />
            <View className="flex-row items-center mx-4">
              <Button icon={<Button.Icon name="open-outline" />} iconOnly label="External link preview" onPress={() => setNotice('External link pressed')} variant="ghost" />
              <LikeButton label="Like preview" liked={liked} onChange={setLiked} loading={state === 'loading'} size="sm" />
              <View className="ml-2"><ViewToggle onChange={setView} view={view} /></View>
            </View>
            <Text accessibilityLiveRegion="polite" className="text-muted font-sans text-sm mx-4">{notice}</Text>
          </View>
        }
      />
      <View className="absolute bottom-20 left-4 right-4 max-w-md self-center rounded-xl bg-background border border-border p-3 gap-2">
        <SegmentedControl accessibilityLabel="Preview data" onChange={(next) => router.setParams({ data: next })} options={[{ value: 'demo', label: 'Demo data' }, { value: 'worst', label: 'Worst case' }]} value={data} />
        <View className="flex-row flex-wrap gap-2">
          <Button icon={<Button.Icon name="remove-outline" />} label="Empty" onPress={() => router.setParams({ data: 'empty' })} pressed={data === 'empty'} size="sm" variant="quiet" />
          <Button icon={<Button.Icon name="ellipse-outline" />} label="One" onPress={() => router.setParams({ data: 'one' })} pressed={data === 'one'} size="sm" variant="quiet" />
          <Button icon={<Button.Icon name="albums-outline" />} label="1,000 cards" onPress={() => router.setParams({ data: 'many' })} pressed={data === 'many'} size="sm" variant="quiet" />
        </View>
        <SegmentedControl accessibilityLabel="Preview state" onChange={(next) => router.setParams({ state: next })} options={[{ value: 'ready', label: 'Ready' }, { value: 'loading', label: 'Loading' }]} value={state} />
      </View>
    </>
  );
}
