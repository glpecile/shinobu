/* oxlint-disable shinobu/log-color-only */
/** Every `--color-*` token declared in `src/global.css`; `tokens.test.ts` keeps the two in sync. */
export const THEME_COLOR_TOKENS = [
  '--color-background',
  '--color-surface',
  '--color-foreground',
  '--color-muted',
  '--color-border',
  '--color-hairline',
  '--color-scrim',
  '--color-on-scrim',
  '--color-accent',
  '--color-accent-foreground',
  '--color-accent-tonal',
  '--color-accent-on-tonal',
  '--color-log',
  '--color-log-foreground',
  '--color-success',
  '--color-success-tonal',
  '--color-toast-shadow',
  '--color-toast-surface',
  '--color-logo-tile',
  '--color-preview-light',
  '--color-preview-light-ink',
  '--color-preview-light-line',
  '--color-preview-dark',
  '--color-preview-dark-ink',
  '--color-preview-dark-line',
] as const;

export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];
