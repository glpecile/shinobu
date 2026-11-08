import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { ListsHeader } from '@/features/lists/list-header';
import { NewListScreen, type ListProvider } from '@/features/lists/new-list-form';
import { Provider } from '@/lib/providers/types';
import { useResolvedMediaItem } from '@/state/queries/resolve-item';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import type { MediaType } from '@/types/media';

const MEDIA_TYPES: readonly string[] = ['MOVIE', 'TV', 'ANIME', 'MANGA'] satisfies MediaType[];

type Props = { providers: { provider: ListProvider; username: string }[]; initialProvider: ListProvider | null };

/** Starts the list with the title it was opened for. */
function NewListWithItem({ id, type, ...props }: Props & { id: string; type: MediaType | undefined }) {
  const { item, isLoading } = useResolvedMediaItem(id, type);
  if (item == null && isLoading) return <View className="flex-1 bg-background">
    <ListsHeader provider={props.initialProvider ?? props.providers[0]?.provider ?? Provider.Letterboxd} title="New list" />
    <View accessibilityLabel="Loading starting title" className="w-full max-w-2xl self-center px-6 gap-6">
      {props.providers.length > 1 && <Skeleton className="h-8 w-72 rounded-full self-center" />}
      <View className="gap-2"><Skeleton className="h-4 w-12 rounded" /><Skeleton className="h-10 w-full rounded-full" /></View>
      <View className="gap-2"><Skeleton className="h-4 w-24 rounded" /><Skeleton className="h-22 w-full rounded-2xl" /></View>
    </View>
  </View>;
  return <NewListScreen {...props} initialItems={item == null ? [] : [item]} />;
}

export default function NewListRoute() {
  const params = useLocalSearchParams<{ provider?: string | string[]; item?: string | string[]; type?: string | string[] }>();
  const connected = useConnectedProviders();
  const providers: Props['providers'] = [];
  const letterboxd = connected.includes(Provider.Letterboxd) ? getLetterboxdUsername() : null;
  const serializd = connected.includes(Provider.Serializd) ? getSerializdUsername() : null;
  if (letterboxd != null) providers.push({ provider: Provider.Letterboxd, username: letterboxd });
  if (serializd != null) providers.push({ provider: Provider.Serializd, username: serializd });
  const requested = params.provider === Provider.Letterboxd || params.provider === Provider.Serializd ? params.provider : null;
  if (typeof params.item !== 'string' || params.item === '') return <NewListScreen initialProvider={requested} providers={providers} />;
  const type = typeof params.type === 'string' && MEDIA_TYPES.includes(params.type) ? params.type as MediaType : undefined;
  return <NewListWithItem id={params.item} initialProvider={requested} providers={providers} type={type} />;
}
