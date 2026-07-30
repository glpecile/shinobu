import { isManualWriteTarget, type WriteCapability } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';

/**
 * R5's reason line for each manual picker row (plan 0032): the row states
 * *why* the provider is not a toggle, in provider-specific fact terms — which
 * AGENTS.md permits, unlike taglines. Two reasons exist and they read
 * differently:
 *
 * - **platform-banned** (Letterboxd on web — structurally permanent, three
 *   spike rounds of evidence): "Can't be added from the web".
 * - **declared `'manual'`** (Serializd until U10's probe — expected to
 *   disappear on its own, plan 0032 R12; Letterboxd's flipped in plan 0033): a
 *   softer "not from Shinobu yet".
 *
 * Pure so the wording is testable; platform is passed in like everywhere else
 * in routing.
 */
const VERB_WORD: Record<WriteCapability, string> = {
  log: 'logged',
  watchlist: 'added',
  'watchlist-remove': 'removed',
};

export function manualWriteReasons(
  manual: readonly ProviderId[],
  capability: WriteCapability,
  platform: string,
): Partial<Record<ProviderId, string>> {
  const word = VERB_WORD[capability];
  const reasons: Partial<Record<ProviderId, string>> = {};
  for (const provider of manual) {
    reasons[provider] = isManualWriteTarget(provider, platform)
      ? platform === 'web'
        ? `Can't be ${word} from the web`
        : `Can't be ${word} on this platform`
      : `Can't be ${word} from Shinobu yet`;
  }
  return reasons;
}
