import { useLocalSearchParams } from 'expo-router';

import { ListsPage } from '@/features/lists/lists-page';
import { listsTitle } from '@/features/lists/lists-row';
import { ProviderListsPager } from '@/features/lists/provider-lists-pager';
import { hardcoverListsUrl } from '@/lib/providers/hardcover/lists';
import { Provider } from '@/lib/providers/types';
import { useHardcoverUsernameQuery } from '@/state/queries/hardcover';
import { useConnectedProviders, useHardcoverListsGranted } from '@/state/session';

export default function HardcoverListsScreen() {
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  const kind = params.kind ?? 'created';
  const connected = useConnectedProviders().includes(Provider.Hardcover);
  const granted = useHardcoverListsGranted();
  const validKind = kind === 'created' || kind === 'liked';
  const username = useHardcoverUsernameQuery({ enabled: connected && granted }).data;
  return (
    <ListsPage
      contentKey={Provider.Hardcover} index provider={Provider.Hardcover} title={validKind ? listsTitle(kind) : 'Lists'}
      unavailable={!validKind ? 'invalid' : connected ? 'reconnect' : 'connect'}
      url={validKind && connected && granted ? hardcoverListsUrl(username ?? '') : null}
    >
      {validKind && connected && granted && <ProviderListsPager kind={kind} provider={Provider.Hardcover} username={username ?? ''} />}
    </ListsPage>
  );
}
