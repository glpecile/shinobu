import {
  formatLocalTime,
  formatRelativeDay,
  localDayOffset,
} from '@/lib/time/relative-day';

import { entryInstant } from './entry';
import type { UpNextEntry } from './types';

export type BadgeTone = 'neutral' | 'accent';

export interface CardBadge {
  label: string;
  tone?: BadgeTone;
}

export const NEW_EPISODE_WINDOW_DAYS = 7;

export function isNewEpisode(entry: UpNextEntry, now: Date): boolean {
  const offset = localDayOffset(entryInstant(entry), now);
  return offset != null && offset <= 0 && offset > -NEW_EPISODE_WINDOW_DAYS;
}

export function continueWatchingBadges(
  entry: UpNextEntry,
  now: Date,
): CardBadge[] {
  const badges: CardBadge[] = [];
  const episodeRuntime = entry.kind === 'episode' ? entry.episode.runtime : null;
  const runtime = episodeRuntime ?? entry.item.runtime;
  if (runtime != null && Number.isFinite(runtime) && runtime > 0) badges.push({ label: `${runtime}m` });
  const behind = entry.kind === 'episode' ? entry.episodesBehind : null;
  if (behind != null && Number.isFinite(behind) && behind > 1) badges.push({ label: `${behind.toLocaleString()} behind` });
  if (isNewEpisode(entry, now)) badges.push({ label: 'New', tone: 'accent' });
  return badges;
}

export function calendarBadges(entry: UpNextEntry, now: Date): CardBadge[] {
  const badges: CardBadge[] = [];
  const instant = entryInstant(entry);
  const day = formatRelativeDay(instant, now);
  if (day != null) badges.push({ label: day, tone: 'accent' });
  const time = formatLocalTime(instant);
  if (time != null) badges.push({ label: time });
  return badges;
}
