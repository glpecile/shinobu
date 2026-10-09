import { useRouter } from 'expo-router';

import { type LetterboxdListKind } from '@/lib/providers/letterboxd/lists';
import { type SerializdListKind } from '@/lib/providers/serializd/lists';
import { routes } from '@/lib/routes';
import { useSuspenseLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { useSuspenseSerializdListsQuery } from '@/state/queries/serializd';
import { ListsIndex } from './lists-grid';
import type { ListsKind } from './lists-kind-filter';

/**
 * Swaps `?kind=` in place, like the watchlist's provider filter: a different
 * tab is not a new destination, and the screen's `username/kind` key remounts
 * the index on change.
 */
function useKindSwap(): (kind: ListsKind) => void {
  const router = useRouter();
  return (kind) => router.setParams({ kind });
}

export function LetterboxdListsIndex({ username, kind, url }: { username: string; kind: LetterboxdListKind; url: string }) {
  const pages = useSuspenseLetterboxdListsQuery(username, kind);
  const swapKind = useKindSwap();
  return (
    <ListsIndex
      count={(list) => list.filmCount}
      emptyBody={kind === 'liked' ? 'Like a list on Letterboxd to see it here.' : 'Create a public list on Letterboxd to see it here. Private lists aren’t available in Shinobu.'}
      fetchNextPage={() => void pages.fetchNextPage()}
      hasNextPage={pages.hasNextPage}
      href={(list) => routes.letterboxdList(list.owner, list.slug)}
      isFetchNextPageError={pages.isFetchNextPageError}
      isFetchingNextPage={pages.isFetchingNextPage}
      isRefetching={pages.isRefetching}
      kind={kind}
      lists={pages.data.pages.flatMap((page) => page.lists)}
      onKindChange={swapKind}
      provider="letterboxd"
      refetch={() => void pages.refetch()}
      url={url}
    />
  );
}

export function SerializdListsIndex({ username, kind, url }: { username: string; kind: SerializdListKind; url: string }) {
  const pages = useSuspenseSerializdListsQuery(username, kind);
  const swapKind = useKindSwap();
  return (
    <ListsIndex
      count={(list) => list.itemCount}
      emptyBody={kind === 'liked' ? 'Like a list on Serializd to see it here.' : 'Create a list on Serializd to see it here.'}
      fetchNextPage={() => void pages.fetchNextPage()}
      hasNextPage={pages.hasNextPage}
      href={(list) => routes.serializdList(list.id)}
      isFetchNextPageError={pages.isFetchNextPageError}
      isFetchingNextPage={pages.isFetchingNextPage}
      isRefetching={pages.isRefetching}
      kind={kind}
      lists={pages.data.pages.flatMap((page) => page.lists)}
      noun="item"
      onKindChange={swapKind}
      provider="serializd"
      refetch={() => void pages.refetch()}
      url={url}
    />
  );
}
