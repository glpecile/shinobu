// oxlint-disable-next-line no-restricted-imports -- this *is* the wrapper the rule points at.
import { useCSSVariable } from 'uniwind';

/** A `--color-*` token declared in `src/global.css`. */
export type ThemeColorToken = `--color-${string}`;

/**
 * A theme token for the props that take a color *string* — an icon glyph, a
 * spinner, a drawn stroke — rather than a `className`. Anything that can take
 * a class still should; this is only for what can't.
 *
 * Native resolves the token, because React Native has no custom properties.
 * Web hands the browser `var(--token)` instead (`./index.web.ts`) — reading it
 * in JS there is a trap, see that file.
 */
export function useThemeColor(token: ThemeColorToken): string | undefined {
  const value = useCSSVariable(token);
  return typeof value === 'string' ? value : undefined;
}
