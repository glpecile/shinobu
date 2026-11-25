/**
 * Mobile browsers only open the on-screen keyboard for focus from a user
 * gesture; programmatic `autoFocus` flashes and closes on Firefox Android,
 * so callers gate `autoFocus` off on coarse pointers.
 */
export function hasCoarsePointer(): boolean {
  if (typeof globalThis.matchMedia !== 'function') return false;
  return globalThis.matchMedia('(pointer: coarse)').matches;
}
