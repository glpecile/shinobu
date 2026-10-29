import type { FontSource } from "expo-font";

// +html declares the faces. Expo treats its own SSR styles as already loaded,
// so register only on the client to keep the splash up until the files arrive.
export const fonts: Record<string, FontSource> = typeof window === "undefined" ? {} : {
  SpaceGrotesk_700Bold: "/fonts/space-grotesk-700.woff2",
  Inter_400Regular: "/fonts/inter-400.woff2",
  Inter_400Regular_Italic: "/fonts/inter-400-italic.woff2",
  Inter_600SemiBold: "/fonts/inter-600.woff2",
  Ionicons: "/fonts/ionicons.woff2",
};
