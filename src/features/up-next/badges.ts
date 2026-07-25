import {
  formatLocalTime,
  formatRelativeDay,
  localDayOffset,
} from '@/lib/time/relative-day';

import type { UpNextEntry } from './types';

/**
 * What each section's cards say on their pill (plan 0019 U6/U7). Pure and
 * `now`-injected like the rest of the feature, so a card's "New" flag ages out
 * on re-render rather than at fetch time.
 */
export type BadgeTone = 'neutral' | 'accent';

export interface CardBadge {
  label: string;
  tone?: BadgeTone;
}

/** An aired episode counts as new for its first week. */
export const NEW_EPISODE_WINDOW_DAYS = 7;

export function isNewEpisode(entry: UpNextEntry, now: Date): boolean {
  const offset = localDayOffset(entry.episode.firstAired, now);
  return offset != null && offset <= 0 && offset > -NEW_EPISODE_WINDOW_DAYS;
}

/** Runtime, then New — the badge order the reference treatment uses. */
export function continueWatchingBadges(
  entry: UpNextEntry,
  now: Date,
): CardBadge[] {
  const badges: CardBadge[] = [];
  const runtime = entry.episode.runtime ?? entry.item.runtime;
  if (runtime != null && runtime > 0) badges.push({ label: `${runtime}m` });
  if (isNewEpisode(entry, now)) badges.push({ label: 'New', tone: 'accent' });
  return badges;
}

/**
 * Calendar leads with when — the card exists to answer exactly that, so the
 * day carries the accent and the local air time follows it in a neutral pill.
 * "Today" on its own is the ambiguous case (already out, or later tonight?),
 * which is precisely the one the clock time resolves; providers that state
 * only a calendar day contribute no time badge rather than a bogus midnight.
 */
export function calendarBadges(entry: UpNextEntry, now: Date): CardBadge[] {
  const badges: CardBadge[] = [];
  const day = formatRelativeDay(entry.episode.firstAired, now);
  if (day != null) badges.push({ label: day, tone: 'accent' });
  const time = formatLocalTime(entry.episode.firstAired);
  if (time != null) badges.push({ label: time });
  return badges;
}
