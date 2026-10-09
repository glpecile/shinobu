import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import Head from '@/components/head';
import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { ProviderIcon } from '@/components/provider-icon';
import { Rail } from '@/components/rail';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { ListCard } from '@/features/lists/list-card';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';

/**
 * A/B/C of the lists card (Home rails + `/lists` grid). Dev screen, not a
 * feature — reachable only by typing `/dev/lists-card-variants`; nothing links
 * to it, and it must not grow a link (the `letterboxd-watchlist-spike` rule).
 *
 * Variant B is iterated into four poster arrangements and **B4 — the filmstrip
 * under a scrim** was the pick; it now backs `ListCard` (Home rails +
 * `/lists` grid), and the B4 section below renders that component, so this
 * page is a reference for the choice, not a live decision. Every card is
 * judged on identical data: six mock lists straddling Serializd and Simkl,
 * including a long title, a one-poster list and an empty draft. The
 * alternatives keep the full optional set (count, author, likes); the adopted
 * card shows only what a lists payload exposes today — count and author
 * inlined with a separator, plus the provider dot. Likes stayed out of the
 * adopted `ListCard` — no lists payload exposes a like count yet (Serializd's
 * index does not — verify before wiring it in).
 */
export default function ListsCardVariantsScreen() {
  return (
    <View className="flex-1 bg-background">
      <Head><title>List card variants — Shinobu</title></Head>
      <ScrollView
        className="flex-1"
        contentContainerClassName={cn('pb-12', screenHeaderTopPadding)}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pt-2 pb-5 gap-2">
          <Text className="font-display text-3xl text-foreground">List card — variants</Text>
          <Text className="font-sans text-sm text-muted leading-relaxed">
            B4 (poster strip under a scrim) won and backs ListCard — the B4 rail below renders the real component, not a
            mock. The rest are the alternatives compared before that call; they show the full optional set (count,
            author, likes), where the adopted card shows what the payloads expose today.
          </Text>
        </View>

        <Section name="B1 · Stacked fan" note="Up to 3 posters fanned like a hand of cards, exact 2:3.">
          {LISTS.map((list) => <BPosterCard art={<Fan previews={list.previews} />} key={list.id} list={list} />)}
        </Section>
        <Section name="B2 · Poster collage" note="A 2×2 wall of the first 4 previews — no +N tile, count stays in the meta.">
          {LISTS.map((list) => <BPosterCard art={<CollageWall previews={list.previews} />} key={list.id} list={list} />)}
        </Section>
        <Section name="B3 · Full poster" note="The lead poster at its full 2:3, framed on a surface field — never cropped.">
          {LISTS.map((list) => <B3PosterCard key={list.id} list={list} />)}
        </Section>
        <Section name="B4 · Poster strip" note="The pick: a filmstrip of up to 4 posters under a scrim, title riding in the art. Renders the real ListCard that backs the Home rails and /lists — serializd-style mocks read as “items”, like production.">
          {LISTS.map((list) => (
            <View className="w-64" key={list.id}>
              <ListCard count={list.itemCount} href="#" list={list} noun={list.noun === 'show' ? 'item' : 'film'} onPress={() => undefined} provider={list.provider} />
            </View>
          ))}
        </Section>
        <Section name="A · Collage cover" note="Poster grid (2×2 at three posters, +N tile for the rest). Meta below. 208pt cards.">
          {LISTS.map((list) => <CollageCard key={list.id} list={list} />)}
        </Section>
        <Section name="C · Leading poster" note="Poster column with an info column beside it. 288pt cards.">
          {LISTS.map((list) => <RowCard key={list.id} list={list} />)}
        </Section>
      </ScrollView>
    </View>
  );
}

type Preview = { id: string; title: string; coverImage: string };
type MockProvider = 'serializd' | 'simkl';
type MockList = {
  id: string;
  title: string;
  owner: string;
  itemCount: number;
  noun: 'film' | 'show';
  likes: number;
  provider: MockProvider;
  previews: Preview[];
};

// Verified live on the TMDB image CDN (w342) 2026-10-09.
const POSTER = {
  noir: 'https://image.tmdb.org/t/p/w342/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
  matrix: 'https://image.tmdb.org/t/p/w342/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
  interstellar: 'https://image.tmdb.org/t/p/w342/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
  pulp: 'https://image.tmdb.org/t/p/w342/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
  godfather: 'https://image.tmdb.org/t/p/w342/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
  fight: 'https://image.tmdb.org/t/p/w342/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
  inception: 'https://image.tmdb.org/t/p/w342/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
  spirited: 'https://image.tmdb.org/t/p/w342/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
} as const;

const pic = (id: keyof typeof POSTER): Preview => ({ id, title: id, coverImage: POSTER[id] });

const LISTS: MockList[] = [
  {
    id: 'noir',
    title: 'The Essential Noir of the 1940s and Early 50s',
    owner: 'noirboy',
    itemCount: 34,
    noun: 'film',
    likes: 12_431,
    provider: 'serializd',
    previews: [pic('noir'), pic('matrix'), pic('interstellar')],
  },
  {
    id: 'pulp',
    title: 'Pulp Era Classics',
    owner: 'get.rich.taste',
    itemCount: 18,
    noun: 'film',
    likes: 1_286,
    provider: 'serializd',
    previews: [pic('pulp'), pic('godfather'), pic('fight')],
  },
  {
    id: 'inception',
    title: 'Inception — Frame by Frame',
    owner: 'ariadne',
    itemCount: 6,
    noun: 'show',
    likes: 512,
    provider: 'simkl',
    previews: [pic('inception')],
  },
  {
    id: 'matrix',
    title: 'The Matrix Trilogy, in Order',
    owner: 'cinephile.42',
    itemCount: 21,
    noun: 'film',
    likes: 3_940,
    provider: 'simkl',
    previews: [pic('matrix'), pic('pulp'), pic('godfather')],
  },
  {
    id: 'frame',
    title: 'One Perfect Frame',
    owner: 'framemaker',
    itemCount: 3,
    noun: 'film',
    likes: 84,
    provider: 'simkl',
    previews: [pic('spirited')],
  },
  {
    // Empty-draft edge case: no art, zero items, zero likes.
    id: 'draft',
    title: 'Untitled Draft',
    owner: 'ghost.writer',
    itemCount: 0,
    noun: 'show',
    likes: 0,
    provider: 'serializd',
    previews: [],
  },
];

/** 12_431 → "12.4k", 104_203 → "104k", 84 → "84". */
function compact(n: number): string {
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

function countLabel(list: MockList): string {
  return `${list.itemCount} ${list.noun}${list.itemCount === 1 ? '' : 's'}`;
}

/** One 2:3 cell. An omitted or artless preview is a flat surface tile. */
function Poster({ preview }: { preview?: Preview }) {
  return preview == null || preview.coverImage === ''
    ? <View className="bg-surface w-full h-full" />
    : <Image className="w-full h-full" contentFit="cover" source={{ uri: preview.coverImage }} />;
}

function Section({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return (
    <View className="mb-9">
      <View className="px-6 mb-3 gap-1">
        <Text className="font-display text-xl text-foreground">{name}</Text>
        <Text className="font-sans text-xs text-muted">{note}</Text>
      </View>
      <Rail contentContainerClassName="px-4 gap-3">{children}</Rail>
    </View>
  );
}

/** The title + count/likes/provider row + author block under a card. */
function CardTitle({ list }: { list: MockList }) {
  return (
    <Text className="mt-2 font-sans-semibold text-sm text-foreground leading-tight" numberOfLines={2}>{list.title}</Text>
  );
}

function CardMeta({ list }: { list: MockList }) {
  const muted = useThemeColor('--color-muted');
  return (
    <View className="flex-row items-center gap-1.5 mt-1.5">
      <Text className="text-muted font-sans text-xs">{countLabel(list)}</Text>
      <View className="flex-1" />
      <Ionicons color={muted} name="heart" size={11} />
      <Text className="text-muted font-sans text-xs">{compact(list.likes)}</Text>
      <ProviderIcon id={list.provider} size={12} />
    </View>
  );
}

function CardOwner({ list }: { list: MockList }) {
  return <Text className="text-muted font-sans text-xs mt-1" numberOfLines={1}>by {list.owner}</Text>;
}

/** B1/B2 share the card shell; only the art differs. */
function BPosterCard({ list, art }: { list: MockList; art: ReactNode }) {
  return (
    <View className="w-64">
      <View className="h-44 rounded-lg border border-border bg-surface overflow-hidden">{art}</View>
      <CardTitle list={list} />
      <CardMeta list={list} />
      <CardOwner list={list} />
    </View>
  );
}

/**
 * B1 — posters fanned like a hand of cards. Later posters sit above, sharing
 * the inner edge, so the fan reads as one stack. Rotation and overlap are
 * geometry (style, not theme), so they never re-theme.
 */
function Fan({ previews }: { previews: Preview[] }) {
  const count = Math.min(previews.length, 3);
  if (count === 0) return <PosterPlaceholder className="w-24 h-36 rounded-lg" />;
  const angles = count === 1 ? [0] : count === 2 ? [-5, 5] : [-7, 0, 7];
  const overlap = count === 3 ? 34 : count === 2 ? 44 : 0;
  return (
    <View className="flex-1 items-center justify-center flex-row">
      {previews.slice(0, 3).map((p, i) => (
        <View
          key={p.id}
          style={{
            width: 96,
            marginLeft: i === 0 ? 0 : -overlap,
            transform: [{ rotate: `${angles[i]}deg` }],
            zIndex: i,
          }}
        >
          <View className="w-24 h-36 rounded-lg border border-border/60 bg-surface overflow-hidden">
            <Poster preview={p} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** B2 — a 2×2 wall of the first 4 previews; missing cells are flat tiles. */
function CollageWall({ previews }: { previews: Preview[] }) {
  if (previews.length === 0) return <PosterPlaceholder className="w-full h-full" />;
  return (
    <View className="flex-1">
      <View className="flex-row flex-1">
        <Poster preview={previews[0]} />
        <Poster preview={previews[1]} />
      </View>
      <View className="flex-row flex-1">
        <Poster preview={previews[2]} />
        <Poster preview={previews[3]} />
      </View>
    </View>
  );
}

/** B3 — the lead poster at its exact 2:3, framed, never cropped. */
function B3PosterCard({ list }: { list: MockList }) {
  const lead = list.previews[0];
  return (
    <View className="w-64">
      <View className="h-48 rounded-lg border border-border bg-surface items-center justify-center overflow-hidden">
        {lead == null ? (
          <PosterPlaceholder className="w-32 h-48 rounded-lg" />
        ) : (
          <View className="w-32 h-48 rounded-lg overflow-hidden bg-surface">
            <Poster preview={lead} />
          </View>
        )}
      </View>
      <CardTitle list={list} />
      <CardMeta list={list} />
      <CardOwner list={list} />
    </View>
  );
}

/** Variant A — a poster grid cover, meta under the card. */
function CollageCard({ list }: { list: MockList }) {
  return (
    <View className="w-52">
      <View className="h-40 rounded-lg border border-border bg-surface overflow-hidden">
        <CollageCover more={list.itemCount - list.previews.length} previews={list.previews.slice(0, 3)} />
      </View>
      <CardTitle list={list} />
      <CardMeta list={list} />
      <CardOwner list={list} />
    </View>
  );
}

function CollageCover({ previews, more }: { previews: (Preview | undefined)[]; more: number }) {
  const [a, b, c] = previews;
  if (a == null) return <PosterPlaceholder className="w-full h-full" />;
  if (b == null) return <Poster preview={a} />;
  if (c == null) {
    return (
      <View className="flex-row flex-1">
        <Poster preview={a} />
        <Poster preview={b} />
      </View>
    );
  }
  return (
    <View className="flex-1">
      <View className="flex-row flex-1">
        <Poster preview={a} />
        <Poster preview={b} />
      </View>
      <View className="flex-row flex-1">
        <Poster preview={c} />
        <View className="bg-surface w-full h-full items-center justify-center">
          {more > 0 && <Text className="text-muted font-sans-semibold text-xl">{`+${more}`}</Text>}
        </View>
      </View>
    </View>
  );
}

/** Variant C — poster column beside an info column; meta pushed to the bottom line. */
function RowCard({ list }: { list: MockList }) {
  const muted = useThemeColor('--color-muted');
  const lead = list.previews[0];
  return (
    <View className="w-72">
      <View className="flex-row rounded-lg border border-border bg-surface overflow-hidden">
        <View className="w-20 h-28">
          {lead == null
            ? <PosterPlaceholder className="w-full h-full" />
            : <Image className="w-full h-full" contentFit="cover" source={{ uri: lead.coverImage }} />}
          {list.previews.length > 1 && (
            <View className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5">
              <Text className="text-accent-foreground font-sans-semibold text-xs">{`+${list.previews.length - 1}`}</Text>
            </View>
          )}
        </View>
        <View className="flex-1 px-3 py-2.5">
          <Text className="font-sans-semibold text-sm text-foreground leading-tight" numberOfLines={2}>{list.title}</Text>
          <Text className="text-muted font-sans text-xs mt-1" numberOfLines={1}>by {list.owner}</Text>
          <View className="flex-row items-center gap-2 mt-auto pt-3">
            <ProviderIcon id={list.provider} size={12} />
            <Text className="text-muted font-sans text-xs">{countLabel(list)}</Text>
            <View className="flex-1" />
            <Ionicons color={muted} name="heart" size={12} />
            <Text className="text-muted font-sans text-xs">{compact(list.likes)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}