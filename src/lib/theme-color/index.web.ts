/** A `--color-*` token declared in `src/global.css`. */
export type ThemeColorToken = `--color-${string}`;

/**
 * Web's half of `useThemeColor` — the token itself, for the browser to
 * resolve, not a value read out of the DOM.
 *
 * `react-native-web` forwards a `var()` color untouched (`modules/isWebColor`
 * passes `currentColor`, `inherit` and anything starting `var(`), so this lands
 * in the DOM as `color: var(--color-muted)` and the cascade resolves it from
 * `global.css` exactly like a class does — including inside an SVG
 * presentation attribute, which is how `ActivityIndicator` paints its stroke.
 *
 * Resolving it in JS here cannot work. The web build is a static export, so
 * every route is prerendered by a Node pass with no DOM: uniwind's
 * `useCSSVariable` reads a probe element off `document` and comes back
 * undefined, callers fall through to whatever their library defaults to
 * (`@react-native-vector-icons` draws black), and **React never patches a
 * hydrated element's inline style** — so the prerendered color survives for
 * the whole of a visitor's first page.
 * See docs/solutions/web-prerender-bakes-js-resolved-colors.md.
 *
 * The one thing this can't serve is a color that gets *composed* rather than
 * painted — `${background}00` for a gradient's transparent stop needs a real
 * hex. Those few sites read the variable directly and say so.
 */
export function useThemeColor(token: ThemeColorToken): string | undefined {
  return `var(${token})`;
}
