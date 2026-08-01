import anilistIcon from '@/assets/providers/anilist.svg';
import letterboxdIcon from '@/assets/providers/letterboxd.svg';
// Serializd ships no simple-icons SVG mark — this is their own favicon
// (converted from serializd.com/favicon.ico), the actual brand logo.
import serializdIcon from '@/assets/providers/serializd.png';
// Simkl's own favicon (simkl.com/apple-touch-icon.png, the black tile with
// the white S) — the Serializd precedent: no simple-icons mark exists, so the
// brand's real favicon is the logo. Upstream ships the S knocked out as
// transparency (iOS composites touch icons itself), which turned the mark
// into a black blob on dark theme; the bundled copy has the glyph filled
// with opaque white so the tile is self-contained and legible on both themes.
import simklIcon from '@/assets/providers/simkl.png';
// TMDB's official square mark (green→blue gradient). TMDB is a metadata
// source, not a provider — no ProviderId — but the search tab labels its
// Movies & TV section with the source that answered, so the icon map carries
// it as an extra key without widening the provider union.
import tmdbIcon from '@/assets/providers/tmdb.svg';
import traktIcon from '@/assets/providers/trakt.svg';

import { Image } from '@/components/image';
import type { ProviderId } from '@/lib/providers/types';

export type IconSourceId = ProviderId | 'tmdb';

// Official brand marks in official brand colors, bundled (assets/providers/)
// so they work offline and inside the strict web CSP. SVG assets render
// through expo-image on every platform — no react-native-svg dependency.
// Trakt is the post-2023-rebrand purple (#9F42C6), AniList the blue "A."
// (#02A9FF), and Letterboxd's three dots carry their official orange/green/
// blue — not the flat #202830 simple-icons default, which vanishes on dark.
const ICONS: Record<IconSourceId, number> = {
  trakt: traktIcon,
  anilist: anilistIcon,
  letterboxd: letterboxdIcon,
  // Serializd's own favicon (teal badge + white mark) — its own background
  // keeps it visible on both themes, per the note above.
  serializd: serializdIcon,
  simkl: simklIcon,
  tmdb: tmdbIcon,
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
