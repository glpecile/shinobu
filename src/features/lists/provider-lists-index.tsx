import { type LetterboxdListKind } from '@/lib/providers/letterboxd/lists';
import { type SerializdListKind } from '@/lib/providers/serializd/lists';
import { useSuspenseLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { useSuspenseSerializdListsQuery } from '@/state/queries/serializd';
import { ListsIndex } from './lists-grid';
import { ListsLoadError } from './lists-page';
import { letterboxdListSummary, serializdListSummary } from './list-summary';

export function LetterboxdListsIndex({ username, kind, url }: { username: string; kind: LetterboxdListKind; url: string }) {
  const pages = useSuspenseLetterboxdListsQuery(username, kind);
  if (pages.data == null) return <ListsLoadError index onRetry={() => pages.refetch()} provider="letterboxd" url={url} />;
  return (
    <ListsIndex
      emptyBody={kind === 'liked' ? 'Like a list on Letterboxd to see it here.' : 'Start one here, or on Letterboxd. Private lists aren’t available in Shinobu.'}
      fetchNextPage={() => void pages.fetchNextPage()}
      hasNextPage={pages.hasNextPage}
      isFetchNextPageError={pages.isFetchNextPageError}
      isFetchingNextPage={pages.isFetchingNextPage}
      kind={kind}
      lists={pages.data.pages.flatMap((page) => page.lists).map(letterboxdListSummary)}
      provider="letterboxd"
      refetch={() => pages.refetch()}
    />
  );
}

export function SerializdListsIndex({ username, kind }: { username: string; kind: SerializdListKind }) {
  const pages = useSuspenseSerializdListsQuery(username, kind);
  return (
    <ListsIndex
      emptyBody={kind === 'liked' ? 'Like a list on Serializd to see it here.' : 'Start one here, or on Serializd.'}
      fetchNextPage={() => void pages.fetchNextPage()}
      hasNextPage={pages.hasNextPage}
      isFetchNextPageError={pages.isFetchNextPageError}
      isFetchingNextPage={pages.isFetchingNextPage}
      kind={kind}
      lists={pages.data.pages.flatMap((page) => page.lists).map(serializdListSummary)}
      provider="serializd"
      refetch={() => pages.refetch()}
    />
  );
}
