import * as Notifications from 'expo-notifications';

import type {
  EpisodeNotificationCandidate,
  NotificationCandidate,
  ReleaseNotificationCandidate,
} from '@/features/notifications/compute-schedule';
import { hashSchedule } from '@/features/notifications/compute-schedule';

import { checkAndStoreHash, clearStoredHash } from './hash-guard';
import type { ScheduleResult } from './types';

/**
 * Native notification scheduler (plan 0020 U4). Cancel-then-schedule the
 * whole batch behind a content-hash guard (R3, R7) — no per-notification
 * diffing, so the only state that can drift is "did the batch change at all."
 */

export const NEW_EPISODES_CHANNEL_ID = 'new-episodes';

let channelEnsured = false;

async function ensureChannel(): Promise<void> {
  if (channelEnsured) return;
  await Notifications.setNotificationChannelAsync(NEW_EPISODES_CHANNEL_ID, {
    name: 'New episodes',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#DC2626',
  });
  channelEnsured = true;
}

/** Which release just landed, in the words a schedule reader uses (plan 0030 R3). */
const RELEASE_BODIES: Record<ReleaseNotificationCandidate['release'], string> = {
  digital: 'Out today — streaming',
  physical: 'Out today — on disc',
  theatrical: 'Out today — in theaters',
};

/**
 * A season drop reads as the season, not as its first episode: a batch fires
 * once (`collapseBatches`), so "S2E1 aired" would undersell ten episodes
 * landing at once and leave the user with no reason to expect the other nine.
 * Mirrors the Calendar card's own label, so the tray and the agenda say the
 * same thing about the same event.
 */
function episodeBody(candidate: EpisodeNotificationCandidate): string {
  if (candidate.count == null) {
    return `S${candidate.season}E${candidate.episode} aired — ready to watch`;
  }
  return `Season ${candidate.season} · ${candidate.count} episodes aired`;
}

/**
 * The notification's second line. The title above it is already the item's
 * title, so a release reads as "Dune: Part Three" / "Out today — in theaters"
 * rather than repeating the name inside the body (plan 0030 U7).
 */
function notificationBody(candidate: NotificationCandidate): string {
  if (candidate.kind === 'release') return RELEASE_BODIES[candidate.release];
  return episodeBody(candidate);
}

async function scheduleOne(candidate: NotificationCandidate): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: candidate.title,
      body: notificationBody(candidate),
      data: { itemId: candidate.itemId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(candidate.fireInstant),
      channelId: NEW_EPISODES_CHANNEL_ID,
    },
  });
}

/**
 * Replaces the entire scheduled batch with `candidates`, or does nothing if
 * the content hash is unchanged from the last replace (R7). Never partially
 * applies — cancel and reschedule both happen, or neither does.
 */
export async function replaceScheduledNotifications(
  candidates: readonly NotificationCandidate[],
): Promise<ScheduleResult> {
  const hash = hashSchedule(candidates);
  if (checkAndStoreHash(hash) === 'skipped') return 'skipped';

  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const candidate of candidates) {
    await scheduleOne(candidate);
  }
  return 'replaced';
}

/** Cancels every scheduled notification and forgets the batch hash (toggle-off). */
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  clearStoredHash();
}

/**
 * One-off, ~5s out, bypassing the hash guard — the settings screen's dev
 * affordance (R11). Carries a real tracked item's id when one is available so
 * tap-through is verifiable end to end, not just permission + delivery.
 */
export async function scheduleTestNotification(itemId?: string): Promise<void> {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Shinobu',
      body: 'Test notification — tap to open a tracked item',
      data: { itemId: itemId ?? '' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: NEW_EPISODES_CHANNEL_ID,
    },
  });
}
