import type { ComponentType } from 'react';

import { ConnectAniListButton } from '@/components/connect-anilist-button';
import { ConnectLetterboxdButton } from '@/components/connect-letterboxd-button';
import { ConnectSerializdButton } from '@/components/connect-serializd-button';
import { ConnectTraktButton } from '@/components/connect-trakt-button';
import type { ProviderId } from '@/lib/providers/types';

/**
 * Each provider's own connect affordance, keyed by id so the cards stay
 * data-driven — adding a provider means a registry entry plus one line here,
 * not a fifth copy-pasted card shell. The buttons keep all their own logic:
 *
 * - Trakt renders the bring-your-own client-id setup form when none is stored.
 * - AniList renders one-tap when this build embeds a client id, or the
 *   one-time client-id form when it doesn't.
 * - Serializd is a WebView token capture on native, email/password on web.
 *
 * They range from one button to a multi-step form, which is exactly why they
 * live in the sheet rather than inline on a row (`provider-sheet.tsx`).
 */
export const CONNECT_BUTTONS: Record<ProviderId, ComponentType> = {
  trakt: ConnectTraktButton,
  anilist: ConnectAniListButton,
  letterboxd: ConnectLetterboxdButton,
  serializd: ConnectSerializdButton,
};
