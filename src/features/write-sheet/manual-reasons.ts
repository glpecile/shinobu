import { isManualWriteTarget, type WriteCapability } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';

const VERB_WORD: Record<WriteCapability, string> = {
  log: 'logged',
  watchlist: 'added',
  'watchlist-remove': 'removed',
  tracking: 'paused or dropped',
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
        ? `Can’t be ${word} from the web`
        : `Can’t be ${word} on this platform`
      : `Can’t be ${word} from Shinobu yet`;
  }
  return reasons;
}
