import type { FontSource } from "expo-font";

// Native: each icon set's config plugin (app.json) bundles its font into the
// binary, so there is nothing to load at runtime.
export const iconFonts: Record<string, FontSource> = {};
