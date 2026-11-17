import { useLocalSearchParams } from 'expo-router';

import { HardcoverListItems, HardcoverListSkeleton } from '@/features/lists/hardcover-list-detail';
import { ListsPage } from '@/features/lists/lists-page';
import { hardcoverListsUrl } from '@/lib/providers/hardcover/lists';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { useHardcoverUsernameQuery } from '@/state/queries/hardcover';
import { useConnectedProviders, useHardcoverListsGranted } from '@/state/session';

export default function HardcoverListScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const connected = useConnectedProviders().includes(Provider.Hardcover);
  const granted = useHardcoverListsGranted();
  const valid = typeof id === 'string' && /^\d+$/.test(id);
  const ready = valid && connected && granted;
  const username = useHardcoverUsernameQuery({ enabled: connected && granted }).data;
  const shareHref = valid ? routes.hardcoverList(id) : undefined;
  return (
    <ListsPage
      // The list's own address is unknown until it loads, so a failed load links to the member's lists.
      contentKey={valid ? id : undefined} fallback={<HardcoverListSkeleton shareHref={shareHref} />} provider={Provider.Hardcover} shareHref={shareHref}
      unavailable={!valid ? 'invalid' : connected ? 'reconnect' : 'connect'}
      url={!ready ? null : username == null ? 'https://hardcover.app' : hardcoverListsUrl(username)}
    >
      {ready && <HardcoverListItems id={Number(id)} />}
    </ListsPage>
  );
}
