// Bare index.tsx avoids breaking typecheck and keeps expo-notifications out of web (docs/solutions/platform-split-no-bare-index-breaks-typecheck.md).
export function NotificationsRuntime(): null {
  return null;
}
