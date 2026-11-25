import anilistIcon from '@/assets/providers/anilist.svg';
import hardcoverIcon from '@/assets/providers/hardcover.svg';
import imdbIcon from '@/assets/providers/imdb.png';
import letterboxdIcon from '@/assets/providers/letterboxd.svg';
import metacriticIcon from '@/assets/providers/metacritic.svg';
import myanimelistIcon from '@/assets/providers/myanimelist.svg';
import rottenTomatoesIcon from '@/assets/providers/rotten-tomatoes.png';
import serializdIcon from '@/assets/providers/serializd.png';
import simklIcon from '@/assets/providers/simkl.png';
import tmdbIcon from '@/assets/providers/tmdb.svg';
import traktIcon from '@/assets/providers/trakt.svg';

import { Image } from '@/components/image';
import type { ProviderId } from '@/lib/providers/types';
import type { RatingSource } from '@/types/media';

export type IconSourceId = ProviderId | RatingSource;

const ICONS: Record<IconSourceId, number> = {
  trakt: traktIcon,
  anilist: anilistIcon,
  letterboxd: letterboxdIcon,
  serializd: serializdIcon,
  simkl: simklIcon,
  hardcover: hardcoverIcon,
  tmdb: tmdbIcon,
  imdb: imdbIcon,
  mal: myanimelistIcon,
  rottenTomatoes: rottenTomatoesIcon,
  metacritic: metacriticIcon,
};

export function ProviderIcon({ id, size = 20 }: { id: IconSourceId; size?: number }) {
  return (
    <Image
      accessibilityLabel=""
      contentFit="contain"
      source={ICONS[id]}
      style={{ width: size, height: size }}
    />
  );
}
