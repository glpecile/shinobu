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

// Android persists per-channel user settings by id; keep 'new-episodes' stable.
const CHANNEL_IDS: Record<NotificationKind, string> = {
  episode: 'new-episodes',
  theatrical: 'theatrical-releases',
  digital: 'digital-releases',
  physical: 'physical-releases',
};

let channelsEnsured = false;
let pendingMutation: Promise<unknown> = Promise.resolve();

function mutateSchedule<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingMutation.then(operation);
  pendingMutation = result.catch(() => {
    clearStoredHash();
  });
  return result;
}

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

const RELEASE_BODIES: Record<ReleaseNotificationCandidate['release'], string> = {
  digital: 'Out today — streaming',
  physical: 'Out today — on disc',
  theatrical: 'Out today — in theaters',
};

function episodeBody(candidate: EpisodeNotificationCandidate): string {
  if (candidate.count == null) {
    return `S${candidate.season}E${candidate.episode} aired — ready to watch`;
  }
  return `Season ${candidate.season} · ${candidate.count} episodes aired`;
}

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

export async function replaceScheduledNotifications(
  candidates: readonly NotificationCandidate[],
): Promise<ScheduleResult> {
  return mutateSchedule(async () => {
    const hash = `grouped:${hashSchedule(candidates)}`;
    if (checkAndStoreHash(hash) === 'skipped') return 'skipped';

    await ensureChannels();
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const candidate of candidates) {
      await scheduleOne(candidate);
    }
    return 'replaced';
  });
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  await mutateSchedule(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    clearStoredHash();
  });
}

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
