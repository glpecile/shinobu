/**
 * The duplicate-push guard behind `usePushRoute` (`./index`), kept in its own
 * module so it is testable without dragging `expo-router` — and therefore
 * react-native — into the bun test runner.
 *
 * `components/presstable` already debounces each pressable's own `onPress`, and
 * that guard is per-component-instance — the right shape for "don't fire this
 * button's action twice", the wrong shape for the navigation stack, because the
 * stack is **global**. A per-instance ref cannot see a second push coming from
 * anywhere else, and there are several ways to produce one without pressing the
 * same pressable twice:
 *
 * - the same show renders as a Continue Watching card *and* as today's Calendar
 *   card, and the same film appears in more than one home carousel — different
 *   component instances, different refs, one shared stack;
 * - the card-actions sheet's "View details" sits over the card that opened it;
 * - a Suspense refetch remounts a row, and a remounted component starts with a
 *   fresh ref at `0`, so its next press is always "the first one".
 *
 * Guarding the resource rather than each of its callers fixes all of them at
 * once, and keeps working for any call site added later.
 */

/**
 * Two pushes of the *same* route inside this window are one intent. Deliberately
 * longer than the 500ms press debounce: this is the backstop for the cases that
 * one structurally cannot catch, so it has to outlast it.
 */
export const PUSH_GUARD_MS = 700;

export interface PushGuard {
  /**
   * Whether this push should happen. Records the decision, so calling it twice
   * for one press would consume the allowance — call it once, at the push.
   */
  allow(href: string, now?: number): boolean;
}

/**
 * Keyed on the **href**, not on "any push": blocking every push inside the
 * window would break legitimate fast navigation (tapping a card, going back and
 * tapping a different one) to fix a problem only repeats have. Two pushes of
 * two different routes are two intents; two pushes of one route inside 700ms
 * never are.
 *
 * A factory rather than bare module state so the behaviour is testable without
 * a clock or module-cache surgery; `./index` holds the app's single instance.
 */
export function createPushGuard(windowMs: number = PUSH_GUARD_MS): PushGuard {
  let lastHref: string | null = null;
  let lastPushAt = 0;

  return {
    allow(href: string, now: number = Date.now()): boolean {
      // A blocked push deliberately does not extend the window — otherwise a
      // finger resting on a card could keep its route locked out indefinitely.
      if (href === lastHref && now - lastPushAt < windowMs) return false;
      lastHref = href;
      lastPushAt = now;
      return true;
    },
  };
}
