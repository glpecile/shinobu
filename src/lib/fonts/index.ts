import type { FontSource } from 'expo-font';

import spaceGrotesk700 from '@/assets/fonts/space-grotesk-700.ttf';
import inter400 from '@/assets/fonts/inter-400.ttf';
import inter400Italic from '@/assets/fonts/inter-400-italic.ttf';
import inter600 from '@/assets/fonts/inter-600.ttf';

// Icon fonts are omitted on native: their Expo config plugins bundle them into the binary.
export const fonts: Record<string, FontSource> = {
  SpaceGrotesk_700Bold: spaceGrotesk700,
  Inter_400Regular: inter400,
  Inter_400Regular_Italic: inter400Italic,
  Inter_600SemiBold: inter600,
};
