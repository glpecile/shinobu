import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import Head from '@/components/head';
import { Button } from '@/components/button';
import { List } from '@/components/List';
import { SegmentedControl } from '@/components/segmented-control';
import { DiscussionResults } from '@/features/discussions/discussion-section';
import type { DiscussionBoard } from '@/lib/http/fourchan';
import { routes } from '@/lib/routes';

const THREADS = [
  {
    id: 291481805,
    title: "Sekai Saikyou no Majo, Hajimemashita / The World's Strongest Witch",
    image: 'https://i.4cdn.org/a/1791440116967699s.jpg',
  },
  {
    id: 291508200,
    title: 'Kusuriya no Hitorigoto / The Apothecary Diaries Season 3',
    image: 'https://i.4cdn.org/a/1791558822884292s.jpg',
  },
];

// Catalog subjects and image URLs have no length limit in the decoded API schema.
const WORST_THREADS = [
  { ...THREADS[0], title: 'I Was Reincarnated as the 7th Prince so I Can Take My Time Perfecting My Magical Ability / Dainana Ouji — Episode 12 discussion' },
  { ...THREADS[0], id: 291481806, title: 'https://example.com/anime/DainanaOujiMajutsuKiwameruEpisode12Discussion', image: '' },
  { ...THREADS[0], id: 291481807, title: '進撃の巨人 The Final Season 完結編（後編）感想スレ 🧙🏽‍♀️', image: 'https://images.example.test/deleted-thumbnail.jpg' },
  { ...THREADS[0], id: 291481808, title: 'نقاش فيلم الرسوم المتحركة — الحلقة الأخيرة', image: '' },
  { ...THREADS[0], id: Number.MAX_SAFE_INTEGER, title: 'X', image: '' },
  { ...THREADS[0], id: 291481810, title: '   ', image: '' },
  { ...THREADS[0], id: 291481811, title: 'Portrait opening-post image', image: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="4000"><rect width="200" height="4000" fill="gray"/><circle cx="100" cy="2000" r="80" fill="white"/></svg>')}` },
  { ...THREADS[0], id: 291481812, title: 'Panoramic opening-post image', image: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="200"><rect width="4000" height="200" fill="gray"/><circle cx="2000" cy="100" r="80" fill="white"/></svg>')}` },
];

/** Dev-only stress fixture; query params preserve the selected data on reload. */
export default function DiscussionDemo() {
  const { data = 'demo', state = 'loaded' } = useLocalSearchParams<{ data?: string; state?: string }>();
  const router = useRouter();
  if (!__DEV__) return <Redirect href={routes.home} />;
  let threads = THREADS;
  switch (data) {
    case 'worst': threads = WORST_THREADS; break;
    case 'empty': threads = []; break;
    case 'one': threads = THREADS.slice(0, 1); break;
    case 'max': threads = Array.from({ length: 12 }, (_, index) => ({ ...WORST_THREADS[index % WORST_THREADS.length], id: 291481805 + index })); break;
  }
  const previews = threads.map((thread, index) => ({
    board: (data === 'max' ? ['a', 'tv', 'co'][Math.floor(index / 4)] : 'a') as DiscussionBoard,
    thread,
  }));
  return (
    <>
      <Head><title>Discussion cards — Shinobu</title></Head>
      <List
        contentContainerClassName="px-6 pt-8 pb-48 w-full max-w-4xl self-center"
        data={[]}
        ListHeaderComponent={
          <View className="gap-4 mb-8">
            <Text accessibilityRole="header" className="text-foreground font-display text-2xl">Discussion cards</Text>
            <DiscussionResults
              searchTitles={["The World's Strongest Witch", 'Sekai Saikyou no Majo, Hajimemashita']}
              threads={state === 'loading' ? [] : previews}
            />
            <Text className="text-muted font-sans text-sm">After discussion</Text>
          </View>
        }
        renderItem={() => null}
      />
      <View className="absolute bottom-20 left-6 right-6 max-w-md self-center rounded-xl bg-background border border-border p-3 gap-2">
        <SegmentedControl
          accessibilityLabel="Preview data"
          onChange={(next) => router.setParams({ data: next })}
          options={[{ value: 'demo', label: 'Demo data' }, { value: 'worst', label: 'Worst case' }]}
          value={data}
        />
        <View className="flex-row flex-wrap gap-2">
          <Button accessibilityLabel="Empty" icon={<Button.Icon name="remove-outline" />} label="Empty" onPress={() => router.setParams({ data: 'empty' })} pressed={data === 'empty'} size="sm" variant="quiet" />
          <Button accessibilityLabel="One" icon={<Button.Icon name="ellipse-outline" />} label="One" onPress={() => router.setParams({ data: 'one' })} pressed={data === 'one'} size="sm" variant="quiet" />
          <Button accessibilityLabel="Many · 12" icon={<Button.Icon name="albums-outline" />} label="Many · 12" onPress={() => router.setParams({ data: 'max' })} pressed={data === 'max'} size="sm" variant="quiet" />
        </View>
        <SegmentedControl
          accessibilityLabel="Preview state"
          onChange={(next) => router.setParams({ state: next })}
          options={[{ value: 'loaded', label: 'Loaded' }, { value: 'loading', label: 'Loading' }]}
          value={state}
        />
      </View>
    </>
  );
}
