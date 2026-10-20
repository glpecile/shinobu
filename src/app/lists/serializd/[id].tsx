import { useLocalSearchParams } from 'expo-router';

import { ListsPage } from '@/features/lists/lists-page';
import { SerializdListItems, SerializdListSkeleton } from '@/features/lists/serializd-list-detail';
import { serializdListUrl } from '@/lib/providers/serializd/lists';
import { routes } from '@/lib/routes';
import { useConnectedProviders } from '@/state/session';
import { getSerializdUsername } from '@/state/session/serializd';

export default function SerializdListScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const username = useConnectedProviders().includes('serializd') ? getSerializdUsername() : null;
  const valid = typeof id === 'string';
  const url = valid ? serializdListUrl(id) : null;
  const shareHref = valid ? routes.serializdList(id) : undefined;
  return (
    <ListsPage fallback={<SerializdListSkeleton shareHref={shareHref} signedIn={username != null} />} key={username} provider="serializd" shareHref={shareHref} url={url}>
      {valid && url != null && <SerializdListItems key={url} id={id} url={url} username={username} />}
    </ListsPage>
  );
}
