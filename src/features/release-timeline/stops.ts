import { hasAired } from '@/lib/time/has-aired';
import { formatRelativeDay } from '@/lib/time/relative-day';
import type { ReleaseCalendar } from '@/types/media';

/** One rendered node of the release rail. */
export interface ReleaseStop {
  kind: keyof ReleaseCalendar;
  /** Row label — how you'd watch it, not TMDB's type name. */
  label: string;
  /** Bare `YYYY-MM-DD`, formatted for display by the caller. */
  date: string;
  /** Not yet out in the *viewer's* timezone (AGENTS.md "Up Next & Timezones"). */
  upcoming: boolean;
  /** "Tomorrow" / "In 12 days" — only ever set on an upcoming stop. */
  relative?: string;
}

const LABELS: Record<keyof ReleaseCalendar, string> = {
  theatrical: 'In theaters',
  digital: 'Digital',
  physical: 'Physical',
};

/**
 * Fallback ordering for stops that share a date (a same-day digital + physical
 * drop is real): how a film actually rolls out, so the rail never flips
 * physical above digital on a tie.
 */
const KIND_ORDER: Array<keyof ReleaseCalendar> = [
  'theatrical',
  'digital',
  'physical',
];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The release calendar as an ordered rail (plan 0029). Sorted by date rather
 * than by kind because the dates *are* the story — the gap between theatrical
 * and digital is what a viewer is reading the section for — and a re-released
 * film can genuinely list them out of the usual order.
 *
 * "Upcoming" is decided through `hasAired`, so a bare TMDB date is compared as
 * local midnight and a release lands for the viewer on the viewer's own
 * calendar day. `now` is injectable for tests; callers let it default.
 *
 * Returns `[]` for an absent calendar (every TV/manga item, and any movie TMDB
 * didn't answer for) — the section renders nothing rather than an empty shell.
 */
export function releaseStops(
  calendar: ReleaseCalendar | undefined,
  now: Date = new Date(),
): ReleaseStop[] {
  if (calendar == null) return [];

  return KIND_ORDER.flatMap((kind, kindIndex) => {
    const date = calendar[kind];
    // A value that isn't a calendar day can't be ordered or compared, and
    // rendering it verbatim would put a broken row on the rail.
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
    .sort((a, b) =>
      a.date === b.date ? a.kindIndex - b.kindIndex : a.date < b.date ? -1 : 1,
    )
    .map(({ kindIndex: _kindIndex, ...stop }) => stop);
}
