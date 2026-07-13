import { Presets } from 'react-native-pulsar';

/**
 * The app's haptic vocabulary (Pulsar / Core Haptics + Android vibrator).
 * Semantic names so call sites say *why* they buzz, not which waveform.
 * Pulsar preset functions are worklets — safe to call from gesture/reanimated
 * worklets directly as well as from the JS thread. Web variant is a no-op
 * (`index.web.ts`): pulsar has no web implementation and iOS Safari has no
 * Vibration API anyway.
 */
export const haptics = {
  /** A press that commits something (confirm buttons). */
  confirm: () => Presets.System.impactMedium(),
  /** The committed action succeeded. */
  success: () => Presets.System.notificationSuccess(),
  /** The committed action failed (fully or partially). */
  error: () => Presets.System.notificationError(),
  /** Light selection tick (toggles, sheet openings). */
  selection: () => Presets.System.selection(),
};
