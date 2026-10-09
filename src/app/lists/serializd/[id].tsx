import { useLocalSearchParams } from 'expo-router';

import { ListsPage } from '@/features/lists/lists-page';
import { SerializdListItems, SerializdListSkeleton } from '@/features/lists/serializd-list-detail';
import { serializdListUrl } from '@/lib/providers/serializd/lists';
import { useConnectedProviders } from '@/state/session';
import { getSerializdUsername } from '@/state/session/serializd';

export default function SerializdListScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const username = useConnectedProviders().includes('serializd') ? getSerializdUsername() : null;
  const url = typeof id === 'string' ? serializdListUrl(id) : null;
  return (
    <ListsPage fallback={<SerializdListSkeleton />} key={username} provider="serializd" url={url}>
      {url != null && typeof id === 'string' && <SerializdListItems id={id} url={url} username={username} />}
    </ListsPage>
  );
}
