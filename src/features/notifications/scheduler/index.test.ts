import { expect, mock, test } from 'bun:test';

import type { NotificationCandidate } from '@/features/notifications/compute-schedule';

const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => store.set(key, value),
    remove: (key: string) => store.delete(key),
  }),
}));

const pending: string[] = [];
let schedule = async (title: string) => { pending.push(title); };
mock.module('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationChannelAsync: async () => {},
  cancelAllScheduledNotificationsAsync: async () => { pending.length = 0; },
  scheduleNotificationAsync: async ({ content }: { content: { title: string } }) => {
    await schedule(content.title);
  },
}));

const { cancelAllScheduledNotifications, replaceScheduledNotifications } = await import('./index.native');
const candidate: NotificationCandidate = {
  kind: 'release',
  itemId: 'tmdb:1',
  title: 'A release',
  release: 'digital',
  fireInstant: '2026-10-23T09:00:00.000Z',
};

test('a newer mute or master-off wins over an in-flight replacement', async () => {
  for (const clear of [() => replaceScheduledNotifications([]), cancelAllScheduledNotifications]) {
    store.clear();
    const started = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    schedule = async (title) => {
      started.resolve();
      await resume.promise;
      pending.push(title);
    };
    const older = replaceScheduledNotifications([candidate]);
    await started.promise;
    const newer = clear();
    resume.resolve();
    await Promise.all([older, newer]);
    expect(pending).toEqual([]);
  }
});

test('a failed native write leaves the same batch retryable', async () => {
  store.clear();
  schedule = async () => { throw new Error('Native scheduling failed'); };
  await expect(replaceScheduledNotifications([candidate])).rejects.toThrow('Native scheduling failed');

  schedule = async (title) => { pending.push(title); };
  expect(await replaceScheduledNotifications([candidate])).toBe('replaced');
  expect(pending).toEqual(['A release']);
});
