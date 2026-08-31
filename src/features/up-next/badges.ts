import {
  formatLocalTime,
  formatRelativeDay,
  localDayOffset,
} from '@/lib/time/relative-day';

import { entryInstant } from './entry';
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
  const offset = localDayOffset(entryInstant(entry), now);
  return offset != null && offset <= 0 && offset > -NEW_EPISODE_WINDOW_DAYS;
}

/** Runtime, then behind-count, then New — the badge order the reference treatment uses. */
export function continueWatchingBadges(
  entry: UpNextEntry,
  now: Date,
): CardBadge[] {
  const badges: CardBadge[] = [];
  // Only an episode carries its own runtime; a release has nothing but the
  // film's, which is the same fallback an episode without one already uses.
  const episodeRuntime = entry.kind === 'episode' ? entry.episode.runtime : null;
  const runtime = episodeRuntime ?? entry.item.runtime;
  if (runtime != null && runtime > 0) badges.push({ label: `${runtime}m` });
  // "Behind 1" is what the card already says by existing, so only a backlog of
  // two or more is worth a pill.
  const behind = entry.kind === 'episode' ? entry.episodesBehind : null;
  if (behind != null && behind > 1) badges.push({ label: `${behind} behind` });
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
  const instant = entryInstant(entry);
  const day = formatRelativeDay(instant, now);
  if (day != null) badges.push({ label: day, tone: 'accent' });
  const time = formatLocalTime(instant);
  if (time != null) badges.push({ label: time });
  return badges;
}
