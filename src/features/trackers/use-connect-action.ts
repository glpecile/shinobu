import { useAniListConnect } from '@/components/connect-anilist-button';
import { useTraktConnect } from '@/components/connect-trakt-button';
import type { ProviderId } from '@/lib/providers/types';

export interface ConnectAction {
  /**
   * True when connecting needs a form or an explanation first, so the row hands
   * off to the provider sheet. False when the row can just do it.
   */
  needsSheet: boolean;
  /** Only meaningful when `needsSheet` is false. */
  connect: () => void;
  /** A connect started from the row is still in flight — drives the spinner. */
  connecting: boolean;
}

/**
 * What the row's Connect button should actually do.
 *
 * A sheet whose entire content is one "Connect Trakt" button is a wasted tap,
 * so a provider that needs nothing from the user connects straight from the
 * row. The sheet is reserved for flows that genuinely have something to show:
 *
 * - **Trakt / AniList** — only when this build ships no credentials and the
 *   user has stored none, i.e. the one-time client-id form.
 * - **Letterboxd / Serializd** — always. Their sheets are not just a button:
 *   they carry the "your session stays on this device, no password is ever
 *   sent to Shinobu" copy, which is the wrong thing to skip on the way into a
 *   sign-in WebView, and on web they are real credential forms.
 *
 * Both provider hooks run unconditionally (fixed hook count) and cost nothing
 * until `connect` is called.
 */
export function useConnectAction(id: ProviderId): ConnectAction {
  const trakt = useTraktConnect();
  const anilist = useAniListConnect();

  // Exhaustive by ProviderId, so a new provider has to declare which it is.
  const actions: Record<ProviderId, ConnectAction> = {
    trakt: {
      needsSheet: trakt.needsSetup,
      connect: () => void trakt.connect(),
      connecting: trakt.status === 'connecting',
    },
    anilist: {
      needsSheet: anilist.needsSetup,
      connect: () => void anilist.connect(),
      connecting: anilist.status === 'connecting',
    },
    // Sheet-only, so the row never spins for these — their own buttons do.
    letterboxd: { needsSheet: true, connect: () => undefined, connecting: false },
    serializd: { needsSheet: true, connect: () => undefined, connecting: false },
    // U5: no connect flow exists yet — sheet-only keeps the row inert until
    // the real PKCE connect button lands.
    simkl: { needsSheet: true, connect: () => undefined, connecting: false },
  };
  return actions[id];
}
