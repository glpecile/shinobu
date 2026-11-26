import { providerProfileUrl } from '@/lib/providers/external-urls';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { useAniListViewerQuery } from '@/state/queries/anilist';
import { useHardcoverViewerQuery } from '@/state/queries/hardcover';
import { useSimklUserSettingsQuery } from '@/state/queries/simkl';
import { useTraktViewerQuery } from '@/state/queries/trakt';
import { getProviderSession } from '@/state/session/tokens';

export interface ProviderAccount {
  username?: string;
  avatar?: string;
  profileUrl?: string;
  loading?: boolean;
}

export function useProviderAccount(id: ProviderId, connected: boolean): ProviderAccount {
  const trakt = useTraktViewerQuery({ enabled: connected && id === Provider.Trakt });
  const anilist = useAniListViewerQuery({ enabled: connected && id === Provider.AniList });
  const simkl = useSimklUserSettingsQuery({ enabled: connected && id === Provider.Simkl });
  const hardcover = useHardcoverViewerQuery({ enabled: connected && id === Provider.Hardcover });

  if (!connected) return {};

  const remote: Record<ProviderId, ProviderAccount & { handle?: string | number }> = {
    [Provider.Trakt]: {
      username: trakt.data?.username ?? undefined,
      avatar: trakt.data?.avatar,
      handle: trakt.data?.slug,
      loading: trakt.isLoading,
    },
    [Provider.AniList]: {
      username: anilist.data?.name,
      avatar: anilist.data?.avatar?.medium ?? undefined,
      handle: anilist.data?.name,
      loading: anilist.isLoading,
    },
    [Provider.Letterboxd]: {},
    [Provider.Simkl]: {
      username: simkl.data?.username ?? undefined,
      avatar: simkl.data?.avatar,
      handle: simkl.data?.accountId,
      loading: simkl.isLoading,
    },
    [Provider.Serializd]: {},
    [Provider.Hardcover]: {
      username: hardcover.data?.username,
      avatar: hardcover.data?.avatar,
      handle: hardcover.data?.username,
      loading: hardcover.isLoading,
    },
  };
  const { handle: remoteHandle, ...account } = remote[id];
  const stored = getProviderSession(id)?.username;
  const hasStored = stored != null && stored !== '';
  const handle = hasStored ? stored : remoteHandle;
  return {
    ...account,
    ...(hasStored ? { username: stored } : {}),
    ...(handle != null && handle !== '' ? { profileUrl: providerProfileUrl(id, handle) } : {}),
  };
}
