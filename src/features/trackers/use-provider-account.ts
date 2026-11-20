import { providerProfileUrl } from '@/lib/providers/external-urls';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { useAniListViewerQuery } from '@/state/queries/anilist';
import { useHardcoverViewerQuery } from '@/state/queries/hardcover';
import { useSimklUserSettingsQuery } from '@/state/queries/simkl';
import { useTraktViewerQuery } from '@/state/queries/trakt';
import { getProviderSession } from '@/state/session/tokens';

export interface ProviderAccount {
  username?: string;
  /** Profile picture URL. Absent for providers that don't expose one. */
  avatar?: string;
  /** The account's public page, once the provider has named it. */
  profileUrl?: string;
  /** The provider read behind username and avatar is in flight. */
  loading?: boolean;
}

/**
 * Which account a provider is connected as.
 *
 * The providers answer this two different ways, and the card shouldn't
 * care which: Letterboxd and Serializd capture a username at sign-in and keep
 * it on the session, while Trakt, AniList, Simkl and Hardcover hand back only
 * an OAuth token, so their handle and avatar are read back from the provider.
 * The remote reads are cached forever under their provider's query root (which
 * disconnect purges), so this costs at most one request per provider per
 * session — and usually zero, since AniList's viewer read is the same one the
 * list feeds prime.
 *
 * Fields are absent while a remote read is in flight or if it fails: the
 * caller falls back to "Connected" and an initial, never a spinner or an
 * error. A settings label is not worth a Suspense boundary that could blank
 * the card.
 */
export function useProviderAccount(
  id: ProviderId,
  connected: boolean,
): ProviderAccount {
  // Every hook runs unconditionally (fixed hook count) and is gated by
  // `enabled` — the same shape `useDiaryFeed` uses for its per-provider reads.
  const trakt = useTraktViewerQuery({ enabled: connected && id === Provider.Trakt });
  const anilist = useAniListViewerQuery({ enabled: connected && id === Provider.AniList });
  const simkl = useSimklUserSettingsQuery({ enabled: connected && id === Provider.Simkl });
  const hardcover = useHardcoverViewerQuery({ enabled: connected && id === Provider.Hardcover });

  if (!connected) return {};

  // Exhaustive by ProviderId, so a new provider has to declare where its
  // account comes from instead of silently rendering none. `handle` is what
  // `providerProfileUrl` keys the profile by.
  const remote: Record<ProviderId, ProviderAccount & { handle?: string | number }> = {
    [Provider.Trakt]: { username: trakt.data?.username ?? undefined, avatar: trakt.data?.avatar, handle: trakt.data?.slug },
    [Provider.AniList]: { username: anilist.data?.name, avatar: anilist.data?.avatar?.medium ?? undefined, handle: anilist.data?.name },
    [Provider.Letterboxd]: {},
    [Provider.Simkl]: { username: simkl.data?.username ?? undefined, avatar: simkl.data?.avatar, handle: simkl.data?.accountId },
    [Provider.Serializd]: {},
    [Provider.Hardcover]: { username: hardcover.data?.username, avatar: hardcover.data?.avatar, handle: hardcover.data?.username },
  };
  const { handle: remoteHandle, ...account } = remote[id];
  const loading = trakt.isLoading || anilist.isLoading || simkl.isLoading || hardcover.isLoading;
  const stored = getProviderSession(id)?.username;
  const hasStored = stored != null && stored !== '';
  const handle = hasStored ? stored : remoteHandle;
  return {
    ...account,
    loading,
    ...(hasStored ? { username: stored } : {}),
    ...(handle != null && handle !== '' ? { profileUrl: providerProfileUrl(id, handle) } : {}),
  };
}
