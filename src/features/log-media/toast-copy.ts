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
  /** What a repeat of this item is called: manga is reread, not rewatched. */
  repeat: 'rewatch' | 'reread' = 'rewatch',
): { title: string; message: string } {
  return {
    title: report.rewatch ? `Logged ${repeat}` : 'Logged',
    message:
      report.skipped.length > 0
        ? `${list(report.succeeded)} — ${list(report.skipped)} already had it`
        : list(report.succeeded),
  };
}

/**
 * A catch-up episode's toast when its report isn't clean but the sheet was
 * already dismissed. Report where it landed and preserve provider notes.
 */
export function episodeNoticeToastCopy(
  code: string,
  report: Pick<LogMediaResult, 'succeeded' | 'failed' | 'outcomes'>,
): { tone: 'success' | 'error'; title: string; message?: string } {
  if (report.failed.length > 0) {
    return {
      tone: 'error',
      title: `${code} failed on ${list(report.failed)}`,
      ...(report.succeeded.length > 0
        ? { message: `Logged on ${list(report.succeeded)}.` }
        : {}),
    };
  }
  const notes = report.outcomes.flatMap((outcome) =>
    outcome.status === 'error' || outcome.reason == null ? [] : [`${PROVIDERS[outcome.provider].label}: ${outcome.reason}.`],
  );
  return {
    tone: report.succeeded.length > 0 ? 'success' : 'error',
    title: report.succeeded.length > 0 ? `Logged ${code.toLowerCase()}` : `${code} was not logged`,
    message: [list(report.succeeded), ...notes].filter(Boolean).join('. '),
  };
}
