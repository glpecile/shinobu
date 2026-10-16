import { type LetterboxdListKind } from '@/lib/providers/letterboxd/lists';
import { type SerializdListKind } from '@/lib/providers/serializd/lists';
import { routes } from '@/lib/routes';
import { useSuspenseLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { useSuspenseSerializdListsQuery } from '@/state/queries/serializd';
import { ListsIndex } from './lists-grid';
import { ListsLoadError } from './lists-page';

export function LetterboxdListsIndex({ username, kind, url }: { username: string; kind: LetterboxdListKind; url: string }) {
  const pages = useSuspenseLetterboxdListsQuery(username, kind);
  if (pages.data == null) return <ListsLoadError index onRetry={() => pages.refetch()} provider="letterboxd" url={url} />;
  return (
    <ListsIndex
      count={(list) => list.filmCount}
      emptyBody={kind === 'liked' ? 'Like a list on Letterboxd to see it here.' : 'Create a public list on Letterboxd to see it here. Private lists aren’t available in Shinobu.'}
      fetchNextPage={() => void pages.fetchNextPage()}
      hasNextPage={pages.hasNextPage}
      href={(list) => routes.letterboxdList(list.owner, list.slug)}
      isFetchNextPageError={pages.isFetchNextPageError}
      isFetchingNextPage={pages.isFetchingNextPage}
      lists={pages.data.pages.flatMap((page) => page.lists)}
      provider="letterboxd"
      refetch={() => pages.refetch()}
      url={url}
    />
  );
}

export function SerializdListsIndex({ username, kind, url }: { username: string; kind: SerializdListKind; url: string }) {
  const pages = useSuspenseSerializdListsQuery(username, kind);
  return (
    <ListsIndex
      count={(list) => list.itemCount}
      emptyBody={kind === 'liked' ? 'Like a list on Serializd to see it here.' : 'Create a list on Serializd to see it here.'}
      fetchNextPage={() => void pages.fetchNextPage()}
      hasNextPage={pages.hasNextPage}
      href={(list) => routes.serializdList(list.id)}
      isFetchNextPageError={pages.isFetchNextPageError}
      isFetchingNextPage={pages.isFetchingNextPage}
      lists={pages.data.pages.flatMap((page) => page.lists)}
      noun="item"
      provider="serializd"
      refetch={() => pages.refetch()}
      url={url}
    />
  );
}
