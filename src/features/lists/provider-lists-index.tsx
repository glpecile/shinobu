import { type HardcoverListKind } from '@/lib/providers/hardcover/lists';
import { type LetterboxdListKind } from '@/lib/providers/letterboxd/lists';
import { type SerializdListKind } from '@/lib/providers/serializd/lists';
import { Provider } from '@/lib/providers/types';
import { useSuspenseHardcoverListsQuery } from '@/state/queries/hardcover';
import { useSuspenseLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { useSuspenseSerializdListsQuery } from '@/state/queries/serializd';
import { ListsIndex } from './lists-grid';
import { ListsLoadError } from './lists-page';
import { hardcoverListSummary, letterboxdListSummary, serializdListSummary } from './list-summary';

export function LetterboxdListsIndex({ username, kind, url }: { username: string; kind: LetterboxdListKind; url: string }) {
  const pages = useSuspenseLetterboxdListsQuery(username, kind);
  if (pages.data == null) return <ListsLoadError index onRetry={() => pages.refetch()} provider={Provider.Letterboxd} url={url} />;
  return (
    <ListsIndex
      emptyBody={kind === 'liked' ? 'Like a list on Letterboxd to see it here.' : 'Start one here, or on Letterboxd. Private lists aren’t available in Shinobu.'}
      fetchNextPage={() => void pages.fetchNextPage()}
      hasNextPage={pages.hasNextPage}
      isFetchNextPageError={pages.isFetchNextPageError}
      isFetchingNextPage={pages.isFetchingNextPage}
      kind={kind}
      lists={pages.data.pages.flatMap((page) => page.lists).map(letterboxdListSummary)}
      provider={Provider.Letterboxd}
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
      provider={Provider.Serializd}
      refetch={() => pages.refetch()}
    />
  );
}

/** One read returns every list, so there is no next page. */
export function HardcoverListsIndex({ kind }: { kind: HardcoverListKind }) {
  const lists = useSuspenseHardcoverListsQuery(kind);
  return (
    <ListsIndex
      emptyBody={kind === 'liked' ? 'Like a list on Hardcover to see it here.' : 'Start one on Hardcover to see it here.'}
      fetchNextPage={() => {}}
      hasNextPage={false}
      isFetchNextPageError={false}
      isFetchingNextPage={false}
      kind={kind}
      lists={lists.data.map(hardcoverListSummary)}
      provider={Provider.Hardcover}
      refetch={() => lists.refetch()}
    />
  );
}
