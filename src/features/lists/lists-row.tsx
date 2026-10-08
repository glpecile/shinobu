import { View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { CollapsibleSection } from '@/components/collapsible-section';
import { ProviderIcon } from '@/components/provider-icon';
import { Rail, VirtualizedRail } from '@/components/rail';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { ViewAllLink } from '@/components/view-all-link';
import { usePushRoute } from '@/lib/navigation';
import { cn } from '@/lib/cn';
import type { LetterboxdListKind } from '@/lib/providers/letterboxd/lists';
import { routes } from '@/lib/routes';
import { useSuspenseLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { WallSkeleton } from '@/features/anime-seasons/wall-skeleton';
import { ListCard } from './list-card';

export function listsTitle(kind: LetterboxdListKind) {
  return kind === 'liked' ? 'Liked Lists' : 'Your Lists';
}

export function ListsRowSkeleton() {
  return (
    <View className="mb-6">
      <Skeleton className="h-7 w-40 rounded mx-4 mb-3" />
      <Rail className="px-4">
        {[0, 1, 2].map((index) => <Skeleton className="w-60 h-48 rounded-lg mr-3" delay={staggerDelay(index)} key={index} />)}
      </Rail>
    </View>
  );
}

/**
 * The list-detail loading state, laid out like the loaded screen so nothing
 * shifts when the data lands: the round-arrow + provider-dot + title header
 * row, then the count/toolbar row, then the films in the persisted view's
 * geometry. Heights match `ListsHeader` (text-2xl ≈ 32px) and the toolbar
 * (buttons are h-8) exactly. The body is `WallSkeleton`, which reads the saved
 * grid/list preference and lays out to match — the load reads as that layout
 * materializing, not as one shape that then swaps into another.
 */
export function ListFilmsSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <View className="flex-1">
      {/* Mirrors ListsHeader: back, provider icon, title — same paddings. */}
      <View className={cn('flex-row items-center gap-3 px-6 pb-4', screenHeaderTopPadding)}>
        <BackButton className="-ml-2" onPress={onBack} />
        <ProviderIcon id="letterboxd" size={20} />
        <Skeleton className="h-8 w-56 rounded" />
      </View>
      {/* Mirrors the `N films · by owner` + buttons toolbar row. */}
      <View className="flex-row items-center gap-3 px-6 pb-3">
        <Skeleton className="h-4 w-28 rounded" />
        <View className="flex-1" />
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-16 rounded" />
      </View>
      <WallSkeleton />
    </View>
  );
}

export function LetterboxdListsRow({ username, kind }: { username: string; kind: LetterboxdListKind }) {
  const pages = useSuspenseLetterboxdListsQuery(username, kind);
  const pushRoute = usePushRoute();
  const lists = pages.data.pages[0].lists;
  const title = listsTitle(kind);
  if (lists.length === 0) return null;
  return (
    <CollapsibleSection
      action={<ViewAllLink onPress={() => pushRoute(routes.letterboxdLists(kind))} title={title} />}
      collapseKey={`letterboxd-${kind}-lists`}
      leading={<ProviderIcon id="letterboxd" size={16} />}
      title={title}
    >
      <VirtualizedRail
        data={lists}
        estimatedItemSize={252}
        keyExtractor={(list) => list.id}
        ListHeaderComponent={<View className="w-4" />}
        ListFooterComponent={<View className="w-1" />}
        renderItem={({ item }) => (
          <View className="w-60 mr-3">
            <ListCard list={item} onPress={() => pushRoute(routes.letterboxdList(item.owner, item.slug))} />
          </View>
        )}
        style={{ height: 192 }}
      />
    </CollapsibleSection>
  );
}
