// Bare index.ts (not index.web.ts) keeps typecheck working without pulling native task modules into web (docs/solutions/platform-split-no-bare-index-breaks-typecheck.md).
export const NOTIFICATIONS_BACKGROUND_TASK = 'shinobu-notifications-refresh';

export async function registerNotificationsBackgroundTask(): Promise<void> {}

export async function unregisterNotificationsBackgroundTask(): Promise<void> {}
