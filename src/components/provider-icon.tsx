import anilistIcon from '@/assets/providers/anilist.svg';
import letterboxdIcon from '@/assets/providers/letterboxd.svg';
import traktIcon from '@/assets/providers/trakt.svg';

import { Image } from '@/components/image';
import type { ProviderId } from '@/lib/providers/types';

// Official simple-icons brand marks, bundled (assets/providers/) so they work
// offline and inside the strict web CSP. SVG assets render through expo-image
// on every platform — no react-native-svg dependency. Letterboxd's mark is
// recolored to its brand green: the simple-icons default (#202830) vanishes
// on the dark theme.
const ICONS: Record<ProviderId, number> = {
  trakt: traktIcon,
  anilist: anilistIcon,
  letterboxd: letterboxdIcon,
};

export function ProviderIcon({ id, size = 20 }: { id: ProviderId; size?: number }) {
  return (
    <Image
      accessibilityLabel=""
      contentFit="contain"
      source={ICONS[id]}
      style={{ width: size, height: size }}
    />
  );
}
