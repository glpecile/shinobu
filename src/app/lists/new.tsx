import { useLocalSearchParams } from 'expo-router';

import { NewListScreen, type ListProvider } from '@/features/lists/new-list-form';
import { Provider } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';

export default function NewListRoute() {
  const params = useLocalSearchParams<{ provider?: string | string[] }>();
  const connected = useConnectedProviders();
  const providers: { provider: ListProvider; username: string }[] = [];
  const letterboxd = connected.includes(Provider.Letterboxd) ? getLetterboxdUsername() : null;
  const serializd = connected.includes(Provider.Serializd) ? getSerializdUsername() : null;
  if (letterboxd != null) providers.push({ provider: Provider.Letterboxd, username: letterboxd });
  if (serializd != null) providers.push({ provider: Provider.Serializd, username: serializd });
  const requested = params.provider === Provider.Letterboxd || params.provider === Provider.Serializd ? params.provider : null;
  return <NewListScreen initialProvider={requested} providers={providers} />;
}
