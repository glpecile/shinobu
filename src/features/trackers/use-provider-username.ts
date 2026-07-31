import type { ProviderId } from '@/lib/providers/types';
import { useAniListViewerQuery } from '@/state/queries/anilist';
import { useTraktViewerQuery } from '@/state/queries/trakt';
import { getProviderSession } from '@/state/session/tokens';

/**
 * Which account a provider is connected as.
 *
 * The four providers answer this two different ways, and the card shouldn't
 * care which: Letterboxd and Serializd capture a username at sign-in and keep
 * it on the session, while Trakt and AniList hand back only an OAuth token, so
 * their handle has to be read back from the provider. Both remote reads are
 * cached forever under their provider's query root (which disconnect purges),
 * so this costs at most one request per provider per session — and usually
 * zero, since AniList's viewer read is the same one the list feeds prime.
 *
 * Returns `undefined` while a remote read is in flight or if it fails: the
 * status line falls back to a plain "Connected", never a spinner or an error.
 * A settings label is not worth a Suspense boundary that could blank the card.
 */
export function useProviderUsername(
  id: ProviderId,
  connected: boolean,
): string | undefined {
  // Both hooks run unconditionally (fixed hook count) and are gated by
  // `enabled` — the same shape `useDiaryFeed` uses for its per-provider reads.
  const trakt = useTraktViewerQuery({ enabled: connected && id === 'trakt' });
  const anilist = useAniListViewerQuery({ enabled: connected && id === 'anilist' });

  if (!connected) return undefined;

  const stored = getProviderSession(id)?.username;
  if (stored != null && stored !== '') return stored;

  // Exhaustive by ProviderId, so a new provider has to declare where its
  // handle comes from instead of silently rendering none.
  const remote: Record<ProviderId, string | undefined> = {
    trakt: trakt.data ?? undefined,
    anilist: anilist.data?.name,
    letterboxd: undefined,
    // U5: Simkl's `/users/settings` read resolves the handle once the session
    // and query layer land — no session exists before then.
    simkl: undefined,
    serializd: undefined,
  };
  return remote[id];
}
