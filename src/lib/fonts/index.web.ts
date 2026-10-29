import ioniconsFont from "@react-native-vector-icons/ionicons/fonts/Ionicons.ttf";
import type { FontSource } from "expo-font";

// The static icon components (@react-native-vector-icons/<set>/static) render
// a glyph with fontFamily "<Set>" but ship no fontSource — they expect the
// config plugin to have bundled the font, which only happens on native. On web
// nothing registers the font, so every icon renders as tofu. Loading the ttf
// through expo-font injects the matching @font-face rule; the key must equal
// the set's postScriptName.
export const iconFonts: Record<string, FontSource> = {
  Ionicons: ioniconsFont,
};
