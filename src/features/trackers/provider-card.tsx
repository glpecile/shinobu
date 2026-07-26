import type { ComponentType } from 'react';

import { ConnectAniListButton } from '@/components/connect-anilist-button';
import { ConnectLetterboxdButton } from '@/components/connect-letterboxd-button';
import { ConnectSerializdButton } from '@/components/connect-serializd-button';
import { ConnectTraktButton } from '@/components/connect-trakt-button';
import {
  VariantOneCard,
  VariantThreeRow,
  VariantTwoCard,
  type VariantCardProps,
} from '@/features/trackers/provider-card-variants';
import type { ProviderId } from '@/lib/providers/types';
import { useDisconnectProvider } from '@/state/session';
import { getProviderSession } from '@/state/session/tokens';

/**
 * TEMPORARY (plan 0026 KTD5/R9). Three visual variants of the provider cards
 * are implemented side by side so the owner can pick one from screenshots;
 * flip this by hand to re-shoot. Deliberately a plain constant — no env var,
 * no persisted setting — because the follow-up commit deletes the two losing
 * variants along with this switch.
 *
 * 1 — Refined rows: today's language, disciplined.
 * 2 — Brand-accented cards: per-provider tint + capability chips.
 * 3 — Compact list: slim uniform rows, details in a sheet.
 */
type CardVariant = 1 | 2 | 3;
const CARD_VARIANT: CardVariant = 1;

const VARIANTS: Record<CardVariant, ComponentType<VariantCardProps>> = {
  1: VariantOneCard,
  2: VariantTwoCard,
  3: VariantThreeRow,
};

/**
 * Each provider's own connect affordance, keyed by id so the card stays
 * data-driven — adding a provider means a registry entry plus one line here,
 * not a fifth copy-pasted card shell. The buttons keep all their own logic:
 *
 * - Trakt renders the bring-your-own client-id setup form when none is stored.
 * - AniList renders one-tap when this build embeds a client id, or the
 *   one-time client-id form when it doesn't.
 * - Serializd is a WebView token capture on native, email/password on web.
 */
const CONNECT_BUTTONS: Record<ProviderId, ComponentType> = {
  trakt: ConnectTraktButton,
  anilist: ConnectAniListButton,
  letterboxd: ConnectLetterboxdButton,
  serializd: ConnectSerializdButton,
};

/**
 * One provider's card, in whichever of its two states applies. The caller owns
 * the connected/disconnected decision (`splitProviders`) — the card does not
 * re-check it, which is what the four `*ConnectRow` wrappers used to do on top
 * of the section filter that had already excluded them.
 */
export function ProviderCard({
  id,
  connected,
}: {
  id: ProviderId;
  connected: boolean;
}) {
  const disconnect = useDisconnectProvider();
  const ConnectButton = CONNECT_BUTTONS[id];
  const Variant = VARIANTS[CARD_VARIANT];
  // Tokenless sessions (Letterboxd) carry the username — worth showing, since
  // a wrong username is the only way that connection can be "broken".
  const username = connected ? getProviderSession(id)?.username : undefined;

  return (
    <Variant
      connectButton={<ConnectButton />}
      connected={connected}
      id={id}
      onDisconnect={() => disconnect(id)}
      username={username}
    />
  );
}
