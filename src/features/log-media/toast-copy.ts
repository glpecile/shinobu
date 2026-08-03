import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import type { LogMediaResult } from './fan-out';

/**
 * The log verb's clean-report toast (plan 0032 R9): fired only when
 * `isCleanWriteReport` lets the sheet close, so a reconcile skip is the one
 * extra fact it can carry ("AniList already had it") — a failure or a
 * reasoned skip never reaches a toast, because a toast can't carry the link
 * that is the recourse (R7). Pure, so the copy is testable without the toast library.
 */
const list = (ids: readonly ProviderId[]) =>
  ids.map((id) => PROVIDERS[id].label).join(', ');

export function logToastCopy(
  report: Pick<LogMediaResult, 'rewatch' | 'succeeded' | 'skipped'>,
): { title: string; message: string } {
  return {
    title: report.rewatch ? 'Logged rewatch' : 'Logged',
    message:
      report.skipped.length > 0
        ? `${list(report.succeeded)} — ${list(report.skipped)} already had it`
        : list(report.succeeded),
  };
}
