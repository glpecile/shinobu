# expo-notifications: no handler means no banner while the app is open

**Added 2026-07-24** while building release notifications
(`docs/plans/0020-release-notifications.md`). U6's "Send test notification"
affordance fires a real notification ~5s after the button press — but on a
fresh `expo-notifications` install, that notification never appeared. No
error, no log — it was just silently swallowed.

## Cause

`expo-notifications` ships a default notification handler that does **not**
show a banner/alert while the app is foregrounded — the assumption is that a
foregrounded app should show in-app UI instead of a system banner. Since
Shinobu's test notification (and any real episode-air notification firing
while the app happens to be open) has no in-app UI to fall back to, the
default policy made every foreground notification invisible.

## Fix

Call `Notifications.setNotificationHandler(...)` once, at module-eval time,
returning `shouldShowBanner`/`shouldShowList`/`shouldPlaySound: true` (see
`src/features/notifications/notifications-runtime/index.native.tsx`). It must
run before any notification can fire, so it lives at the top of a module
imported eagerly from `app/_layout.tsx` — the same "module-scope side effect,
eager root import" shape as `background-task`'s `TaskManager.defineTask`
(KTD-4). A `useEffect` would be too late for a notification that can arrive
within seconds of mount.

## Web note

The handler registration only makes sense where notifications can fire, so
`notifications-runtime` and `background-task` (which eagerly calls
`TaskManager.defineTask`) are both platform-split the same way as
`features/notifications/scheduler`: bare `index.ts`/`index.tsx` is a true
no-op that imports nothing from `expo-notifications`/`expo-task-manager`/
`expo-background-task`, and `index.native.tsx`/`index.native.ts` carries the
real registration. Confirmed via `bun run build:web` — zero references to any
of the three packages in the built web bundle.
