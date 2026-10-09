import { useLocalSearchParams } from 'expo-router';

import { ListsGridSkeleton } from '@/features/lists/lists-grid';
import { ListsPage } from '@/features/lists/lists-page';
import { listsTitle } from '@/features/lists/lists-row';
import { LetterboxdListsIndex } from '@/features/lists/provider-lists-index';
import { letterboxdListsUrl } from '@/lib/providers/letterboxd/lists';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';

export default function LetterboxdListsScreen() {
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  const kind = params.kind ?? 'created';
  const username = useConnectedProviders().includes('letterboxd') ? getLetterboxdUsername() : null;
  const validKind = kind === 'created' || kind === 'liked';
  const url = validKind ? letterboxdListsUrl(username ?? '', kind) : null;
  return (
    <ListsPage fallback={<ListsGridSkeleton />} index key={`${username}/${kind}`} provider="letterboxd" title={validKind ? listsTitle(kind) : 'Lists'} unavailable={validKind && username == null ? 'connect' : 'invalid'} url={url}>
      {url != null && username != null && validKind && <LetterboxdListsIndex kind={kind} url={url} username={username} />}
    </ListsPage>
  );
}
