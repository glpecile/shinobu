/**
 * Guard repeated pushes of the same route across callers. The standalone module can run in Bun
 * without the router.
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
