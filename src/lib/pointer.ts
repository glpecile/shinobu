/**
 * Pointer-coarseness probe for the one thing that genuinely differs between a
 * mouse and a finger on web: whether focusing an input summons an on-screen
 * keyboard.
 *
 * Mobile browsers only open the keyboard for a focus that follows a user
 * gesture. A programmatic `node.focus()` at commit (which is what React does
 * for `autoFocus`) gets a flash-open-then-close on Firefox Android, leaving the
 * field unusable — so `autoFocus` is gated off wherever the pointer is coarse.
 *
 * Deliberately not a hook: the only consumer reads it once at mount, and a
 * pointer type does not change under a mounted screen.
 */
export function hasCoarsePointer(): boolean {
  // Undefined on native (no CSSOM) and during web SSR — both answer "not a
  // touch browser", which keeps native's autoFocus and server markup as-is.
  if (typeof globalThis.matchMedia !== 'function') return false;
  return globalThis.matchMedia('(pointer: coarse)').matches;
}
