import { View } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';

import { CollapsibleSection } from '@/components/collapsible-section';
import { ProviderIcon } from '@/components/provider-icon';
import { VirtualizedRail } from '@/components/rail';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { SuspenseSection } from '@/components/suspense-section';
import { usePushRoute } from '@/lib/navigation';
import { Provider } from '@/lib/providers/types';
import { useHiddenLists, visibleByIds } from '@/state/prefs/hidden-items';
import { useSuspenseHardcoverBookListsQuery } from '@/state/queries/hardcover';
import { useConnectedProviders, useHardcoverListsGranted } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { LIST_CARD_TEXT_HEIGHT, ListCard } from './list-card';
import { ListSheet, useListSheet } from './list-sheet';
import { hardcoverListSummary } from './list-summary';
import { ListCardSkeleton } from './lists-row';
import { POSTER_STACK_RATIO } from './poster-stack';

const CARD_WIDTH = 240;

function BookListsRail({ bookId }: { bookId: number }) {
  const pushRoute = usePushRoute();
  const { fontScale } = useWindowDimensions();
  const { openList, sheetProps } = useListSheet();
  const { data } = useSuspenseHardcoverBookListsQuery(bookId);
  const lists = visibleByIds(data.map(hardcoverListSummary), useHiddenLists(), (list) => [list.href]);
  if (lists.length === 0) return null;
  return (
    // Pulls the section's own `px-4` header and 16px gutter out to the column's `px-6`, as the Similar books rail.
    <View className="-mx-4 -mb-6 mt-8">
      <CollapsibleSection collapseKey="details-book-lists" leading={<ProviderIcon id={Provider.Hardcover} size={16} />} title="Lists">
        <VirtualizedRail
          data={lists}
          estimatedItemSize={CARD_WIDTH + 16}
          keyExtractor={(list) => list.id}
          ListHeaderComponent={<View className="w-4" />}
          ListFooterComponent={<View className="w-1" />}
          renderItem={({ item }) => (
            <View className="w-60 mr-4">
              <ListCard list={item} onActions={openList} onPress={() => pushRoute(item.href)} />
            </View>
          )}
          style={{ height: CARD_WIDTH / POSTER_STACK_RATIO + LIST_CARD_TEXT_HEIGHT * fontScale }}
        />
        <ListSheet {...sheetProps} />
      </CollapsibleSection>
    </View>
  );
}

function BookListsSkeleton() {
  return (
    <View className="mt-8">
      <Skeleton className="h-6 w-24 rounded mb-4" />
      <View className="flex-row overflow-hidden">
        {[0, 1, 2].map((index) => <View className="w-60 mr-4" key={index}><ListCardSkeleton delay={staggerDelay(index)} /></View>)}
      </View>
    </View>
  );
}

/**
 * The most-liked public Hardcover lists that include a book. Reads only with a
 * Hardcover session that holds the lists grant, and shows nothing for a book in no list.
 */
export function BookListsSection({ item, resetKey }: { item: NormalizedMediaItem; resetKey?: unknown }) {
  const connected = useConnectedProviders().includes(Provider.Hardcover);
  const granted = useHardcoverListsGranted();
  const bookId = item.externalIds.hardcover;
  if (bookId == null || !connected || !granted) return null;
  return (
    <SuspenseSection fallback={<BookListsSkeleton />} resetKey={resetKey}>
      <BookListsRail bookId={bookId} />
    </SuspenseSection>
  );
}
