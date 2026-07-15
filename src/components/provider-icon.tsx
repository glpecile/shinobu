import anilistIcon from '@/assets/providers/anilist.svg';
import letterboxdIcon from '@/assets/providers/letterboxd.svg';
import traktIcon from '@/assets/providers/trakt.svg';

import { Image } from '@/components/image';
import type { ProviderId } from '@/lib/providers/types';

// Official brand marks in official brand colors, bundled (assets/providers/)
// so they work offline and inside the strict web CSP. SVG assets render
// through expo-image on every platform — no react-native-svg dependency.
// Trakt is the post-2023-rebrand purple (#9F42C6), AniList the blue "A."
// (#02A9FF), and Letterboxd's three dots carry their official orange/green/
// blue — not the flat #202830 simple-icons default, which vanishes on dark.
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
