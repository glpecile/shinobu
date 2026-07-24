/**
 * Web/default no-op (plan 0020 R12) — see
 * `docs/solutions/platform-split-no-bare-index-breaks-typecheck.md` for why
 * this bare file, not `index.web.ts`, is the one that must exist. Never
 * imports `expo-task-manager`/`expo-background-task` so neither reaches the
 * web bundle; `index.native.ts` carries the real `defineTask` registration.
 */

export const NOTIFICATIONS_BACKGROUND_TASK = 'shinobu-notifications-refresh';

export async function registerNotificationsBackgroundTask(): Promise<void> {}

export async function unregisterNotificationsBackgroundTask(): Promise<void> {}
