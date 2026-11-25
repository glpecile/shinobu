import { filmReleaseStatus } from '@/features/log-media/release-gate';
import type { NormalizedMediaItem, PersonCreditRow } from '@/types/media';

export type FormatFilter = 'ALL' | 'MOVIE' | 'TV';

export const FORMAT_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'MOVIE', label: 'Movies' },
  { value: 'TV', label: 'TV', accessibilityLabel: 'TV series' },
] as const satisfies readonly {
  value: FormatFilter;
  label: string;
  accessibilityLabel?: string;
}[];

export interface CreditRole {
  role: string;
  detail: string;
}

export interface Credit {
  item: NormalizedMediaItem;
  roles: readonly CreditRole[];
}

export interface Filmography {
  credits: readonly Credit[];
  roles: readonly string[];
}

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

export function catalogueFilmography(items: readonly NormalizedMediaItem[]): Filmography {
  return { credits: items.map((item) => ({ item, roles: [] })), roles: [] };
}

export function matchesFormat(item: NormalizedMediaItem, format: FormatFilter): boolean {
  if (format === 'ALL') return true;
  const type = item.type === 'ANIME' ? (item.isFilm === true ? 'MOVIE' : 'TV') : item.type;
  return type === format;
}

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
      key: string;
      year: number | null;
      count: number;
      open: boolean;
    }
  | {
      kind: 'posters';
      key: string;
      entries: readonly { credit: Credit; roles: string }[];
    }
  | {
      kind: 'entry';
      key: string;
      credit: Credit;
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

export function timelineRows(
  credits: readonly Credit[],
  options: {
    format: FormatFilter;
    role: string | null;
    folded: ReadonlySet<string>;
    now?: Date;
    columns?: number;
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
  released.sort((a, b) => (b.item.year ?? 0) - (a.item.year ?? 0));
  upcoming.sort((a, b) =>
    (a.item.releaseDate ?? '9999').localeCompare(b.item.releaseDate ?? '9999'),
  );

  const rows: TimelineRow[] = [];
  const pushGroup = (key: string, year: number | null, group: readonly Credit[]) => {
    const open = !folded.has(key);
    rows.push({ kind: 'head', key, year, count: group.length, open });
    if (!open) return;
    if (options.columns != null) {
      for (let index = 0; index < group.length; index += options.columns) {
        rows.push({
          kind: 'posters',
          key: `${key}-posters-${index}`,
          entries: group.slice(index, index + options.columns).map((credit) => ({
            credit,
            roles: roleText(credit, role),
          })),
        });
      }
      return;
    }
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
