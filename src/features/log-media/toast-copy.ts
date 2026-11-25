import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import type { LogMediaResult } from './fan-out';

const list = (ids: readonly ProviderId[]) =>
  ids.map((id) => PROVIDERS[id].label).join(', ');

export function logToastCopy(
  report: Pick<LogMediaResult, 'rewatch' | 'succeeded' | 'skipped'> & { queued?: readonly ProviderId[] },
  repeat: 'rewatch' | 'reread' = 'rewatch',
  span?: string,
): { title: string; message: string } {
  const later =
    report.queued != null && report.queued.length > 0
      ? `${list(report.queued)} when you are back online`
      : null;
  if (report.succeeded.length === 0 && later != null) {
    return { title: 'Saved offline', message: `Logs to ${later}` };
  }
  const landed =
    report.skipped.length > 0
      ? `${list(report.succeeded)} — ${list(report.skipped)} already had it`
      : list(report.succeeded);
  return {
    title: report.rewatch ? `Logged ${repeat}` : span != null ? `Logged ${span}` : 'Logged',
    message: later == null ? landed : `${landed}. ${later}`,
  };
}

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
    outcome.status === 'error' || outcome.status === 'queued' || outcome.reason == null ? [] : [`${PROVIDERS[outcome.provider].label}: ${outcome.reason}.`],
  );
  return {
    tone: report.succeeded.length > 0 ? 'success' : 'error',
    title: report.succeeded.length > 0 ? `Logged ${code.toLowerCase()}` : `${code} was not logged`,
    message: [list(report.succeeded), ...notes].filter(Boolean).join('. '),
  };
}
