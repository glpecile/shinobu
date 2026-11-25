import { Presets } from 'react-native-pulsar';

/** Pulsar presets are worklets, so these can be called from Reanimated/gesture worklets or JS. */
export const haptics = {
  confirm: () => Presets.System.impactLight(),
  destructive: () => Presets.System.impactMedium(),
  success: () => Presets.System.notificationSuccess(),
  error: () => Presets.System.notificationError(),
  selection: () => Presets.System.selection(),
};
