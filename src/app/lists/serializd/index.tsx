import { useLocalSearchParams } from 'expo-router';

import { ListsPage } from '@/features/lists/lists-page';
import { listsTitle } from '@/features/lists/lists-row';
import { ProviderListsPager } from '@/features/lists/provider-lists-pager';
import { serializdListsUrl } from '@/lib/providers/serializd/lists';
import { useConnectedProviders } from '@/state/session';
import { getSerializdUsername } from '@/state/session/serializd';

export default function SerializdListsScreen() {
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  const kind = params.kind ?? 'created';
  const username = useConnectedProviders().includes('serializd') ? getSerializdUsername() : null;
  const validKind = kind === 'created' || kind === 'liked';
  const url = validKind ? serializdListsUrl(username ?? '') : null;
  return (
    <ListsPage contentKey={username ?? ''} index provider="serializd" title={validKind ? listsTitle(kind) : 'Lists'} unavailable={validKind && username == null ? 'connect' : 'invalid'} url={url}>
      {url != null && username != null && validKind && <ProviderListsPager kind={kind} provider="serializd" username={username} />}
    </ListsPage>
  );
}
