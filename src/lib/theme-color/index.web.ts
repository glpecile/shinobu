/** A `--color-*` token declared in `src/global.css`. */
export type ThemeColorToken = `--color-${string}`;

/**
 * Return a CSS variable so the browser can resolve theme color after static prerender. CSS
 * variables cannot be used for color math
 * (docs/solutions/web-prerender-bakes-js-resolved-colors.md).
 */
export function useThemeColor(token: ThemeColorToken): string | undefined {
  return `var(${token})`;
}
