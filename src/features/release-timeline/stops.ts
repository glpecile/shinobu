import { hasAired } from '@/lib/time/has-aired';
import { formatRelativeDay } from '@/lib/time/relative-day';
import type { ReleaseCalendar } from '@/types/media';

export interface ReleaseStop {
  kind: keyof ReleaseCalendar;
  label: string;
  /** Bare `YYYY-MM-DD`. */
  date: string;
  upcoming: boolean;
  relative?: string;
}

const LABELS: Record<keyof ReleaseCalendar, string> = {
  theatrical: 'In theaters',
  digital: 'Digital',
  physical: 'Physical',
};

const KIND_ORDER: Array<keyof ReleaseCalendar> = ['theatrical', 'digital', 'physical'];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function releaseStops(
  calendar: ReleaseCalendar | undefined,
  now: Date = new Date(),
): ReleaseStop[] {
  if (calendar == null) return [];

  return KIND_ORDER.flatMap((kind, kindIndex) => {
    const date = calendar[kind];
    if (date == null || !DATE_ONLY.test(date)) return [];
    const upcoming = !hasAired(date, now);
    const relative = upcoming ? formatRelativeDay(date, now) : null;
    return [
      {
        kind,
        kindIndex,
        label: LABELS[kind],
        date,
        upcoming,
        ...(relative != null ? { relative } : {}),
      },
    ];
  })
    .sort((a, b) => (a.date === b.date ? a.kindIndex - b.kindIndex : a.date < b.date ? -1 : 1))
    .map(({ kindIndex: _kindIndex, ...stop }) => stop);
}
