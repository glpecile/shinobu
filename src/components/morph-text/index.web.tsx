import { TextMorph } from 'torph/react';

/** Mirrors index.tsx — keep both platform variants' props identical. */
export interface MorphTextProps {
  /** The current text — a change morphs on web, swaps on native. */
  children: string | number;
  className?: string;
}

/**
 * Web: torph morphs the old text into the new in place (shared characters
 * slide, the rest crossfades) instead of snapping. Library defaults ride —
 * they're tuned (strong ease-out, honors prefers-reduced-motion), and the
 * first render never animates, so static text pays nothing. Torph renders an
 * inline-block span that animates its own width; keep it shrink-wrapped
 * (e.g. `self-start` / `self-center`) rather than stretched when the
 * surrounding text alignment matters.
 */
export function MorphText({ children, className }: MorphTextProps) {
  return <TextMorph className={className}>{String(children)}</TextMorph>;
}
