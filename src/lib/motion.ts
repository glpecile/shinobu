import { cubicBezier, Easing } from 'react-native-reanimated';

/**
 * Shared motion tokens: one curve per *kind* of motion, one duration per *kind*
 * of moment. Durations and easings were previously inlined per component, which
 * is how a 200ms backdrop ends up paired with a 300ms sheet — motion only reads
 * as one system if the numbers come from one place.
 *
 * Two flavours of each curve are exported because Reanimated has two animation
 * APIs and they take different easing types:
 *
 * - `EASE_*` — declarative CSS transitions/animations (`transitionTimingFunction`,
 *   `animationTimingFunction`). This is the codebase's default style
 *   (`components/skeleton.tsx`, `components/media-carousel.tsx`).
 * - `KEYFRAME_*` — layout-animation `Keyframe` builders (`easing:` inside a
 *   keyframe), used for entering/exiting elements.
 *
 * Everything here is timing + easing, never springs: springs don't run on web in
 * this codebase (see `components/lightbox/index.web.tsx`), and the same surfaces
 * ship to web, iOS and Android.
 *
 * `components/app-shell/index.web.tsx` and `components/lightbox/index.web.tsx`
 * predate this module and still inline equivalent curves; migrate them
 * opportunistically rather than in an unrelated change.
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

/**
 * Strong ease-in-out (easeInOutQuart). For something already on screen that
 * moves or rotates *in place* (a disclosure chevron): it accelerates away and
 * brakes into its new position like a real object, where an ease-out would look
 * like it slammed to a stop.
 */
export const EASE_IN_OUT = cubicBezier(0.77, 0, 0.175, 1);

/**
 * Exits: quick and quiet. `ease-in`-shaped rather than `ease-out` because the
 * user has already decided to leave — the element should get out of the way,
 * not perform. Quadratic, so it never feels like it stalls before moving.
 */
export const KEYFRAME_EASE_EXIT = Easing.out(Easing.quad);

/**
 * Durations, in ms. All well under the 300ms ceiling for product UI: past that
 * an animation stops reading as feedback and starts reading as latency.
 */
export const DURATION = {
  /** A colour/selected-state crossfade on a control the user just tapped. */
  color: 150,
  /** Content settling in after the user switches what a panel is showing. */
  swap: 180,
  /** A glyph rotating in place (a disclosure chevron). */
  toggle: 200,
  /**
   * A surface arriving on screen — a sheet and its backdrop. Deliberately at
   * the fast end of the 150–250ms band rather than the middle: logging is the
   * app's core action, so this sheet is a *many-times-a-day* surface, and the
   * frequency rule says to drastically reduce motion on those. Paired with the
   * strong ease-out below, 160ms reads as "already there" — the panel only
   * travels 28px, so there is no distance that needs the extra time.
   */
  enter: 160,
  /** Its exit: faster still — the user has already decided to leave. */
  exit: 120,
} as const;
