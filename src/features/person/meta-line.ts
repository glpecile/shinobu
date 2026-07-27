import { formatCalendarDate } from '@/lib/time/calendar-date';
import type { NormalizedPerson } from '@/types/media';

/**
 * Whole years between two bare dates (UTC-parsed like `formatCalendarDate`) — the
 * person's age, or age at death when `until` is the deathday.
 */
export function yearsBetween(from: string, until: Date): number | null {
  const [year, month, day] = from.split('-').map(Number);
  if (!year || !month || !day) return null;
  const hadBirthday =
    until.getUTCMonth() + 1 > month ||
    (until.getUTCMonth() + 1 === month && until.getUTCDate() >= day);
  const age = until.getUTCFullYear() - year - (hadBirthday ? 0 : 1);
  return age >= 0 ? age : null;
}

/**
 * "Acting · Nov 12, 1980 (45) · London, Ontario, Canada" — TMDB has no
 * height field, so age is the one derivable extra stat. Shared by the
 * `/person/[id]` header and the credit sheet a long-press opens, so the same
 * person reads identically in both (plan 0028 R1).
 */
export function personMetaLine(person: NormalizedPerson): string {
  let lifespan: string | null = null;
  if (person.birthday != null) {
    if (person.deathday != null) {
      const [y, m, d] = person.deathday.split('-').map(Number);
      const died = y && m && d ? new Date(Date.UTC(y, m - 1, d)) : null;
      const age = died != null ? yearsBetween(person.birthday, died) : null;
      lifespan = `${formatCalendarDate(person.birthday)} – ${formatCalendarDate(person.deathday)}${
        age != null ? ` (${age})` : ''
      }`;
    } else {
      const age = yearsBetween(person.birthday, new Date());
      lifespan = `${formatCalendarDate(person.birthday)}${age != null ? ` (${age})` : ''}`;
    }
  }
  return [person.knownForDepartment ?? null, lifespan, person.birthplace ?? null]
    .filter((part) => part != null)
    .join(' · ');
}
