import { Provider, type ProviderId } from '@/lib/providers/types';
import { useAniListViewerQuery } from '@/state/queries/anilist';
import { useHardcoverUsernameQuery } from '@/state/queries/hardcover';
import { useSimklUsernameQuery } from '@/state/queries/simkl';
import { useTraktViewerQuery } from '@/state/queries/trakt';
import { getProviderSession } from '@/state/session/tokens';

/**
 * Which account a provider is connected as.
 *
 * The providers answer this two different ways, and the card shouldn't
 * care which: Letterboxd and Serializd capture a username at sign-in and keep
 * it on the session, while Trakt, AniList, Simkl and Hardcover hand back only an OAuth
 * token, so their handle has to be read back from the provider. The remote
 * reads are cached forever under their provider's query root (which disconnect
 * purges), so this costs at most one request per provider per session — and
 * usually zero, since AniList's viewer read is the same one the list feeds
 * prime.
 *
 * Returns `undefined` while a remote read is in flight or if it fails: the
 * status line falls back to a plain "Connected", never a spinner or an error.
 * A settings label is not worth a Suspense boundary that could blank the card.
 */
export function useProviderUsername(
  id: ProviderId,
  connected: boolean,
): string | undefined {
  // Every hook runs unconditionally (fixed hook count) and are gated by
  // `enabled` — the same shape `useDiaryFeed` uses for its per-provider reads.
  const trakt = useTraktViewerQuery({ enabled: connected && id === Provider.Trakt });
  const anilist = useAniListViewerQuery({ enabled: connected && id === Provider.AniList });
  const simkl = useSimklUsernameQuery({ enabled: connected && id === Provider.Simkl });
  const hardcover = useHardcoverUsernameQuery({ enabled: connected && id === Provider.Hardcover });

  if (!connected) return undefined;

  const stored = getProviderSession(id)?.username;
  if (stored != null && stored !== '') return stored;

  // Exhaustive by ProviderId, so a new provider has to declare where its
  // handle comes from instead of silently rendering none.
  const remote: Record<ProviderId, string | undefined> = {
    trakt: trakt.data ?? undefined,
    anilist: anilist.data?.name,
    letterboxd: undefined,
    // `/users/settings` — the hook selects the handle out of the settings
    // read; POST-shaped despite being a read (state/queries/simkl.ts).
    simkl: simkl.data,
    serializd: undefined,
    hardcover: hardcover.data,
  };
  return remote[id];
}
