// No-op on web: react-native-pulsar is native-only and iOS Safari has no Vibration API.
export const haptics = {
  confirm: () => {},
  destructive: () => {},
  success: () => {},
  error: () => {},
  selection: () => {},
};
