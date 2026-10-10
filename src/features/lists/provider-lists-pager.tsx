import { ListsGridSkeleton } from './lists-grid';
import type { ListsKind } from './lists-kind-filter';
import { ListsPage } from './lists-page';
import { ListsPager } from './lists-pager';
import { LetterboxdListsIndex, SerializdListsIndex } from './provider-lists-index';
import { letterboxdListsUrl } from '@/lib/providers/letterboxd/lists';
import { serializdListsUrl } from '@/lib/providers/serializd/lists';

/** Each neighbour loads and recovers independently, without remounting the pager. */
export function ProviderListsPager({ provider, username, kind }: {
  provider: 'letterboxd' | 'serializd';
  username: string;
  kind: ListsKind;
}) {
  return <ListsPager kind={kind} renderKind={(pageKind) => {
    switch (provider) {
      case 'letterboxd': {
        const url = letterboxdListsUrl(username, pageKind);
        return <ListsPage embedded fallback={<ListsGridSkeleton />} index provider={provider} url={url}>
          {url != null && <LetterboxdListsIndex kind={pageKind} url={url} username={username} />}
        </ListsPage>;
      }
      case 'serializd': {
        const url = serializdListsUrl(username);
        return <ListsPage embedded fallback={<ListsGridSkeleton />} index provider={provider} url={url}>
          {url != null && <SerializdListsIndex kind={pageKind} url={url} username={username} />}
        </ListsPage>;
      }
    }
  }} />;
}
