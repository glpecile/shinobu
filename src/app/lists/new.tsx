import { useLocalSearchParams } from 'expo-router';

import { NewListScreen, type ListProvider } from '@/features/lists/new-list-form';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';

export default function NewListRoute() {
  const params = useLocalSearchParams<{ provider?: string | string[] }>();
  const connected = useConnectedProviders();
  const providers: { provider: ListProvider; username: string }[] = [];
  const letterboxd = connected.includes('letterboxd') ? getLetterboxdUsername() : null;
  const serializd = connected.includes('serializd') ? getSerializdUsername() : null;
  if (letterboxd != null) providers.push({ provider: 'letterboxd', username: letterboxd });
  if (serializd != null) providers.push({ provider: 'serializd', username: serializd });
  const requested = params.provider === 'letterboxd' || params.provider === 'serializd' ? params.provider : null;
  return <NewListScreen initialProvider={requested} providers={providers} />;
}
