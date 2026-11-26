import type { LogMediaResult } from '@/features/log-media/fan-out';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

function labels(ids: readonly ProviderId[]): string {
  return ids.map((id) => PROVIDERS[id].label).join(', ');
}

export interface QuickLogOutcome {
  phase: 'settling' | 'failed';
  notice: string | null;
}

export function resolveQuickLog(result: LogMediaResult, source: ProviderId): QuickLogOutcome {
  const sourceOk = result.succeeded.includes(source) || result.skipped.includes(source);

  if (!sourceOk) {
    const blamed = result.failed.length > 0 ? result.failed : [source];
    return { phase: 'failed', notice: `Failed on ${labels(blamed)}.` };
  }
  if (result.failed.length > 0) {
    return { phase: 'settling', notice: `Failed on ${labels(result.failed)}.` };
  }
  return { phase: 'settling', notice: null };
}
