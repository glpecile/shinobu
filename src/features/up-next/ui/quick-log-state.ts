import type { LogMediaResult } from '@/features/log-media/fan-out';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

/**
 * Same joined-label copy as the confirm sheet's `labels`, re-derived from the
 * registry here: that one lives in a component module, and this file stays
 * free of React so it can be unit-tested.
 */
function labels(ids: readonly ProviderId[]): string {
  return ids.map((id) => PROVIDERS[id].label).join(', ');
}

/**
 * The quick-log card's state machine, kept pure so the interesting part —
 * which outcomes may advance the card — is unit-tested without a renderer
 * (plan 0019 U5, KTD-6 / R8 / R9).
 *
 * `settling` is the deliberate gap between a successful write and a moved
 * card: nothing is advanced optimistically, so the card holds a pending state
 * until the button's own awaited invalidation of the Up Next slot resolves and
 * the recomputed data either advances it, moves it to Calendar, or drops it.
 */
export type QuickLogPhase = 'idle' | 'logging' | 'settling' | 'failed';

export interface QuickLogOutcome {
  phase: 'settling' | 'failed';
  /** Inline notice text, or null when everything succeeded quietly. */
  notice: string | null;
}

/**
 * What a finished fan-out means for *this* card. The card may only advance on
 * the strength of its own source provider: the entry was computed from that
 * provider's data — a failed source write cannot produce new data to advance
 * from, however well the other providers did.
 *
 * A skipped source counts as ok: skip means that provider already records the
 * watch, so its data is already ahead of the card. `invalidateAfterLog`
 * refreshes the Up Next slot for skipped providers too, so this arm always has
 * a refetch to settle against.
 */
export function resolveQuickLog(
  result: LogMediaResult,
  source: ProviderId,
): QuickLogOutcome {
  const sourceOk =
    result.succeeded.includes(source) || result.skipped.includes(source);

  if (!sourceOk) {
    const blamed = result.failed.length > 0 ? result.failed : [source];
    return { phase: 'failed', notice: `Failed on ${labels(blamed)}.` };
  }
  if (result.failed.length > 0) {
    // Partial success: the card still advances (its source landed), but the
    // failure is named rather than swallowed.
    return { phase: 'settling', notice: `Failed on ${labels(result.failed)}.` };
  }
  return { phase: 'settling', notice: null };
}

/** Whether the checkmark shows a pending state (KTD-6: write *and* settle). */
export function isQuickLogPending(phase: QuickLogPhase): boolean {
  return phase === 'logging' || phase === 'settling';
}
