import type { ComponentType } from 'react';

import { ConnectAniListButton } from '@/components/connect-anilist-button';
import { ConnectHardcoverButton } from '@/components/connect-hardcover-button';
import { ConnectLetterboxdButton } from '@/components/connect-letterboxd-button';
import { ConnectSerializdButton } from '@/components/connect-serializd-button';
import { ConnectSimklButton } from '@/components/connect-simkl-button';
import { ConnectTraktButton } from '@/components/connect-trakt-button';
import type { ProviderId } from '@/lib/providers/types';

export const CONNECT_BUTTONS: Record<ProviderId, ComponentType> = {
  trakt: ConnectTraktButton,
  anilist: ConnectAniListButton,
  letterboxd: ConnectLetterboxdButton,
  serializd: ConnectSerializdButton,
  simkl: ConnectSimklButton,
  hardcover: ConnectHardcoverButton,
};
