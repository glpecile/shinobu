import { filmReleaseStatus } from '@/features/log-media/release-gate';
import type { NormalizedMediaItem, PersonCreditRow } from '@/types/media';

export type FormatFilter = 'ALL' | 'MOVIE' | 'TV';

export interface CreditRole {
  /** The department row the credit came from ("Directing", "Acting"). */
  role: string;
  /** Job title(s) or character name(s) on that row; '' when unknown. */
  detail: string;
}

/** One title, every role the person holds on it. */
export interface Credit {
  item: NormalizedMediaItem;
  roles: readonly CreditRole[];
}

export interface Filmography {
  credits: readonly Credit[];
  /** Role chip order — the rows' order, which already leads with known-for. */
  roles: readonly string[];
}

/**
 * The per-department rows folded into one credit per title: a film someone
 * both directed and wrote is one row on the timeline carrying both roles,
 * where the carousels showed it once per department.
 */
export function mergeCreditRows(rows: readonly PersonCreditRow[]): Filmography {
  const byId = new Map<string, { item: NormalizedMediaItem; roles: CreditRole[] }>();
  for (const row of rows) {
    for (const item of row.items) {
      let credit = byId.get(item.id);
      if (credit == null) {
        credit = { item, roles: [] };
        byId.set(item.id, credit);
      }
      credit.roles.push({ role: row.role, detail: row.roles[item.id] ?? '' });
    }
  }
  return { credits: [...byId.values()], roles: rows.map((row) => row.role) };
}

/** A studio's catalogue has no roles; every title is a bare credit. */
export function catalogueFilmography(items: readonly NormalizedMediaItem[]): Filmography {
  return { credits: items.map((item) => ({ item, roles: [] })), roles: [] };
}

export function matchesFormat(item: NormalizedMediaItem, format: FormatFilter): boolean {
  return format === 'ALL' || item.type === format;
}

/** Each role with how many titles it holds under `format`; empty roles drop out. */
export function roleCounts(
  filmography: Filmography,
  format: FormatFilter,
): { role: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const credit of filmography.credits) {
    if (!matchesFormat(credit.item, format)) continue;
    for (const { role } of credit.roles) counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return filmography.roles
    .filter((role) => counts.has(role))
    .map((role) => ({ role, count: counts.get(role)! }));
}

export const UPCOMING_HEAD = 'head-upcoming';

export type TimelineRow =
  | {
      kind: 'head';
      /** `UPCOMING_HEAD`, or `head-<year>`; the fold state is keyed by it. */
      key: string;
      /** Null is the upcoming stop. */
      year: number | null;
      count: number;
      /** Whether entries follow — the rail only runs on from an open head. */
      open: boolean;
    }
  | {
      kind: 'entry';
      key: string;
      credit: Credit;
      /** The credit's role text under the active role filter. */
      roles: string;
      last: boolean;
    };

function roleText(credit: Credit, role: string | null): string {
  return credit.roles
    .filter((entry) => role == null || entry.role === role)
    .map((entry) => entry.detail)
    .filter((detail) => detail !== '')
    .join(', ');
}

/**
 * The flat row stream the list virtualizes: a head per release year, newest
 * first, with the year's titles hanging under it; unreleased and undated
 * work sits under one upcoming head at the top, soonest first. A head in
 * `folded` keeps its entries out of the stream.
 *
 * `filmReleaseStatus` reads a title's date and year only, which is exactly
 * what a TMDB credit carries — a series with neither is an unannounced one.
 */
export function timelineRows(
  credits: readonly Credit[],
  options: {
    format: FormatFilter;
    /** Null shows every role. */
    role: string | null;
    /** Head keys whose entries are hidden. */
    folded: ReadonlySet<string>;
    now?: Date;
  },
): TimelineRow[] {
  const { format, role, folded, now = new Date() } = options;
  const upcoming: Credit[] = [];
  const released: Credit[] = [];
  for (const credit of credits) {
    if (!matchesFormat(credit.item, format)) continue;
    if (role != null && !credit.roles.some((entry) => entry.role === role)) continue;
    (filmReleaseStatus(credit.item, now) === 'released' ? released : upcoming).push(credit);
  }
  // A released title always has a year (a parsed date or a past year is what
  // made it released), so the fallback never sorts.
  released.sort((a, b) => (b.item.year ?? 0) - (a.item.year ?? 0));
  // Undated (unannounced) work last, behind anything with a date.
  upcoming.sort((a, b) =>
    (a.item.releaseDate ?? '9999').localeCompare(b.item.releaseDate ?? '9999'),
  );

  const rows: TimelineRow[] = [];
  const pushGroup = (key: string, year: number | null, group: readonly Credit[]) => {
    const open = !folded.has(key);
    rows.push({ kind: 'head', key, year, count: group.length, open });
    if (!open) return;
    group.forEach((credit, index) =>
      rows.push({
        kind: 'entry',
        key: credit.item.id,
        credit,
        roles: roleText(credit, role),
        last: index === group.length - 1,
      }),
    );
  };

  if (upcoming.length > 0) pushGroup(UPCOMING_HEAD, null, upcoming);

  // Insertion order is the sorted order, so the map is the year sequence.
  const byYear = new Map<number, Credit[]>();
  for (const credit of released) {
    const year = credit.item.year ?? 0;
    const group = byYear.get(year);
    if (group == null) byYear.set(year, [credit]);
    else group.push(credit);
  }
  for (const [year, group] of byYear) pushGroup(`head-${year}`, year, group);
  return rows;
}
