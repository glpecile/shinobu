import * as Notifications from 'expo-notifications';

import type {
  EpisodeNotificationCandidate,
  NotificationCandidate,
  NotificationKind,
  ReleaseNotificationCandidate,
} from '@/features/notifications/compute-schedule';
import {
  hashSchedule,
  NOTIFICATION_KINDS,
  notificationKind,
} from '@/features/notifications/compute-schedule';

import { checkAndStoreHash, clearStoredHash } from './hash-guard';
import type { ScheduleResult } from './types';

/**
 * Native notification scheduler (plan 0020 U4). Cancel-then-schedule the
 * whole batch behind a content-hash guard (R3, R7) — no per-notification
 * diffing, so the only state that can drift is "did the batch change at all."
 */

/**
 * One Android channel per notification kind, matching the in-app toggles. The
 * id doubles as the thread, which stacks each kind separately on Android and
 * in iOS Notification Center. `new-episodes` predates the split; keeping it
 * keeps users' channel settings.
 */
const CHANNEL_IDS: Record<NotificationKind, string> = {
  episode: 'new-episodes',
  theatrical: 'theatrical-releases',
  digital: 'digital-releases',
  physical: 'physical-releases',
};

let channelsEnsured = false;

async function ensureChannels(): Promise<void> {
  if (channelsEnsured) return;
  await Promise.all(
    NOTIFICATION_KINDS.map(({ kind, label }) =>
      Notifications.setNotificationChannelAsync(CHANNEL_IDS[kind], {
        name: label,
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#DC2626',
      }),
    ),
  );
  channelsEnsured = true;
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
  const channelId = CHANNEL_IDS[notificationKind(candidate)];
  await Notifications.scheduleNotificationAsync({
    content: {
      title: candidate.title,
      body: notificationBody(candidate),
      data: { itemId: candidate.itemId, mediaType: candidate.kind === 'episode' ? 'TV' : 'MOVIE' },
      threadIdentifier: channelId,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(candidate.fireInstant),
      channelId,
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
  // A new prefix reschedules existing batches once, onto the per-kind channels.
  const hash = `grouped:${hashSchedule(candidates)}`;
  if (checkAndStoreHash(hash) === 'skipped') return 'skipped';

  await ensureChannels();
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
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Shinobu',
      body: 'Test notification — tap to open a tracked item',
      data: { itemId: itemId ?? '' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: CHANNEL_IDS.episode,
    },
  });
}
