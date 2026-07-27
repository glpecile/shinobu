import type { ComponentType } from 'react';

import {
  VariantOneCard,
  VariantThreeRow,
  VariantTwoCard,
  type VariantCardProps,
} from '@/features/trackers/provider-card-variants';
import { useProviderUsername } from '@/features/trackers/use-provider-username';
import type { ProviderId } from '@/lib/providers/types';
import { useDisconnectProvider } from '@/state/session';

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
 * One provider's card, in whichever of its two states applies. The caller owns
 * the connected/disconnected decision (`splitProviders`) — the card does not
 * re-check it, which is what the four `*ConnectRow` wrappers used to do on top
 * of the section filter that had already excluded them.
 */
export function ProviderCard({
  id,
  connected,
  onOpenSheet,
}: {
  id: ProviderId;
  connected: boolean;
  onOpenSheet: () => void;
}) {
  const disconnect = useDisconnectProvider();
  const username = useProviderUsername(id, connected);
  const Variant = VARIANTS[CARD_VARIANT];

  return (
    <Variant
      connected={connected}
      id={id}
      onDisconnect={() => disconnect(id)}
      onOpenSheet={onOpenSheet}
      username={username}
    />
  );
}
