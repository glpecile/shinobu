/**
 * Web/default no-op (plan 0020 R12) — see
 * `docs/solutions/platform-split-no-bare-index-breaks-typecheck.md` for why
 * this bare file, not `index.web.ts`, is the one that must exist. Never
 * imports `expo-notifications` so it doesn't reach the web bundle at all;
 * `index.native.tsx` carries the real handler registration + refresh
 * lifecycle (see `docs/solutions/expo-notifications-foreground-handler.md`).
 */

export function NotificationsRuntime(): null {
  return null;
}
