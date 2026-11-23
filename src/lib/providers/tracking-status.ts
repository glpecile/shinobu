import { PROVIDERS } from './registry';
import type { ProviderId } from './types';

/**
 * Why a pause or drop on `provider` is a skip, or null when it writes. Only
 * an entry in `changeable` moves: one being watched or read, or already
 * paused or dropped the other way. A missing entry is never created, and a
 * completed or planned one is never moved (#227).
 */
export function trackingStatusSkip<S extends string | number>(
  provider: ProviderId,
  current: S | null,
  target: S,
  changeable: readonly S[],
  name: (status: S) => string,
): string | null {
  const { label } = PROVIDERS[provider];
  if (current == null) return `not in your ${label} library`;
  if (current === target) return `already ${name(target)} on ${label}`;
  if (!changeable.includes(current)) return `${label} tracks this as ${name(current)}`;
  return null;
}
