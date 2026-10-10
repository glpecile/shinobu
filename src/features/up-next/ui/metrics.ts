/** Card backs peek above the face; both loaded rails and placeholders reserve it. */
export const STACK_OFFSET = 5;

/** 144px art, 8px gap, then scaled text or the 36px quick-log button. */
export function episodeCardRailHeight(fontScale: number) {
  return 152 + Math.max(36, 44 * fontScale);
}
