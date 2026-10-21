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

type NotificationGroup = 'episode' | ReleaseNotificationCandidate['release'];

/**
 * One Android channel per kind of news, so system settings can mute theatrical
 * releases without muting episodes. The id doubles as the thread, which stacks
 * each kind separately on Android and in iOS Notification Center.
 * `new-episodes` predates the split; keeping it keeps users' channel settings.
 */
const CHANNELS: Record<NotificationGroup, { id: string; name: string }> = {
  episode: { id: 'new-episodes', name: 'New episodes' },
  theatrical: { id: 'theatrical-releases', name: 'In theaters' },
  digital: { id: 'digital-releases', name: 'Streaming releases' },
  physical: { id: 'physical-releases', name: 'Disc releases' },
};

function channelFor(candidate: NotificationCandidate) {
  return CHANNELS[candidate.kind === 'release' ? candidate.release : 'episode'];
}

let channelsEnsured = false;

async function ensureChannels(): Promise<void> {
  if (channelsEnsured) return;
  await Promise.all(
    Object.values(CHANNELS).map((channel) =>
      Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
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
  const channel = channelFor(candidate);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: candidate.title,
      body: notificationBody(candidate),
      data: { itemId: candidate.itemId, mediaType: candidate.kind === 'episode' ? 'TV' : 'MOVIE' },
      threadIdentifier: channel.id,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(candidate.fireInstant),
      channelId: channel.id,
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
      channelId: CHANNELS.episode.id,
    },
  });
}
