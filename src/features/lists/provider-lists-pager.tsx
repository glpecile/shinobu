import { useWindowDimensions } from '@/lib/window-dimensions';

import { Provider } from '@/lib/providers/types';
import { ProviderListLink } from './list-header';
import { ListsGridSkeleton } from './lists-grid';
import type { ListsKind } from './lists-kind-filter';
import { ListsPage } from './lists-page';
import { ListsPager } from './lists-pager';
import { HardcoverListsIndex, LetterboxdListsIndex, SerializdListsIndex } from './provider-lists-index';
import type { ListSummary } from './list-summary';
import { hardcoverListsUrl } from '@/lib/providers/hardcover/lists';
import { letterboxdListsUrl } from '@/lib/providers/letterboxd/lists';
import { serializdListsUrl } from '@/lib/providers/serializd/lists';

function listsUrl(provider: ListSummary['provider'], username: string, kind: ListsKind) {
  switch (provider) {
    case Provider.Letterboxd:
      return letterboxdListsUrl(username, kind);
    case Provider.Serializd:
      return serializdListsUrl(username);
    case Provider.Hardcover:
      return username === '' ? null : hardcoverListsUrl(username);
  }
}

/** Each neighbour loads and recovers independently, without remounting the pager. */
export function ProviderListsPager({ provider, username, kind }: {
  provider: ListSummary['provider'];
  /** Hardcover reads by token: its username only builds the link, and is '' until the viewer loads. */
  username: string;
  kind: ListsKind;
}) {
  // A phone has room for the switch's labels or the link's, not both.
  const compact = useWindowDimensions().width < 640;
  const actionUrl = listsUrl(provider, username, kind);
  return <ListsPager action={actionUrl != null && <ProviderListLink iconOnly={compact} provider={provider} size="sm" url={actionUrl} />} kind={kind} renderKind={(pageKind) => {
    switch (provider) {
      case Provider.Letterboxd: {
        const url = letterboxdListsUrl(username, pageKind);
        return <ListsPage embedded fallback={<ListsGridSkeleton />} index provider={provider} url={url}>
          {url != null && <LetterboxdListsIndex kind={pageKind} url={url} username={username} />}
        </ListsPage>;
      }
      case Provider.Serializd: {
        const url = serializdListsUrl(username);
        return <ListsPage embedded fallback={<ListsGridSkeleton />} index provider={provider} url={url}>
          {url != null && <SerializdListsIndex kind={pageKind} username={username} />}
        </ListsPage>;
      }
      case Provider.Hardcover:
        // The link is not the content's identity: the username lands after the lists can.
        return <ListsPage contentKey={provider} embedded fallback={<ListsGridSkeleton />} index provider={provider} url={hardcoverListsUrl(username)}>
          <HardcoverListsIndex kind={pageKind} />
        </ListsPage>;
    }
  }} />;
}
