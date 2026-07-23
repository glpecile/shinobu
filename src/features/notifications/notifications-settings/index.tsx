/**
 * Web has no notification path (AGENTS.md "Web & CORS" R12) — Up Next is
 * web's equivalent surface, and no `expo-notifications` import should reach
 * the web bundle. `index.native.tsx` carries the real toggle/permission UI.
 */
export function NotificationsSettingsSection(): null {
  return null;
}
