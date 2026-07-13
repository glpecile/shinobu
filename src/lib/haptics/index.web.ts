/**
 * Web variant: no-ops. react-native-pulsar is a native TurboModule with no
 * web implementation, and iOS/iPadOS Safari doesn't implement the Vibration
 * API, so a web haptics shim would be dead code for half the web audience.
 * Same shape as `index.ts` — call sites never branch on platform.
 */
export const haptics = {
  confirm: () => {},
  success: () => {},
  error: () => {},
  selection: () => {},
};
