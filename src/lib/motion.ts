import { LayoutAnimation } from 'react-native';
import { cubicBezier, Easing } from 'react-native-reanimated';

/**
 * Shared web and native motion tokens. Use EASE_* for declarative animations and KEYFRAME_*
 * for layout builders.
 */

/**
 * Strong ease-out (easeOutQuint). For anything *entering* the screen or
 * responding to a press — the fast start is what makes the interface feel like
 * it heard the tap. CSS's built-in `ease-out` is much weaker and reads sluggish
 * at the same duration.
 */
export const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
/** `EASE_OUT` for `Keyframe` builders. */
export const KEYFRAME_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** `EASE_OUT` as a CSS string, for react-native-web `animation*`/`transition*` style keys. */
export const CSS_EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * Strong ease-in-out (easeInOutQuart). For something already on screen that
 * moves or rotates *in place* (a disclosure chevron): it accelerates away and
 * brakes into its new position like a real object, where an ease-out would look
 * like it slammed to a stop.
 */
export const EASE_IN_OUT = cubicBezier(0.77, 0, 0.175, 1);
/** `EASE_IN_OUT` for `withTiming`, which takes an `Easing` rather than a CSS curve. */
export const TIMING_EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/**
 * Quick ease-out for exits. A bezier keeps predefined web layout animations
 * from dropping composed curves like `Easing.out(Easing.quad)` to linear.
 * Custom `Keyframe` builders on web still only support named curves.
 */
export const KEYFRAME_EASE_EXIT = Easing.bezier(0.5, 1, 0.89, 1);

/** Durations in ms. */
export const DURATION = {
  color: 150,
  swap: 180,
  toggle: 200,
  /** Shared entrance duration for surfaces and their backdrops. */
  enter: 160,
  exit: 120,
  /** One skeleton pulse cycle. */
  pulse: 1400,
} as const;

/** Native layout animation for disclosures. The web implementation is a no-op. */
export const DISCLOSURE_LAYOUT = LayoutAnimation.create(
  DURATION.toggle,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);
