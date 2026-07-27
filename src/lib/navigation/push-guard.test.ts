import { describe, expect, test } from 'bun:test';

import { createPushGuard, PUSH_GUARD_MS } from './push-guard';

describe('createPushGuard', () => {
  test('allows the first push', () => {
    expect(createPushGuard().allow('/details/trakt-1', 0)).toBe(true);
  });

  test('drops a repeat of the same route inside the window', () => {
    const guard = createPushGuard();

    expect(guard.allow('/details/trakt-1', 0)).toBe(true);
    // The double tap: ~200ms later, the same card, the same route.
    expect(guard.allow('/details/trakt-1', 200)).toBe(false);
  });

  test('drops a repeat from a different caller — the point of module scope', () => {
    // Continue Watching's card and today's Calendar card are two component
    // instances of one show; a per-instance press debounce sees one press each.
    const guard = createPushGuard();

    expect(guard.allow('/details/trakt-1', 0)).toBe(true);
    expect(guard.allow('/details/trakt-1', 120)).toBe(false);
  });

  test('allows the same route again once the window has passed', () => {
    const guard = createPushGuard();

    expect(guard.allow('/details/trakt-1', 0)).toBe(true);
    expect(guard.allow('/details/trakt-1', PUSH_GUARD_MS)).toBe(true);
  });

  test('never blocks a different route', () => {
    // Tapping a card, going back and tapping the next one is two intents, and
    // must not be swallowed to fix a problem only repeats have.
    const guard = createPushGuard();

    expect(guard.allow('/details/trakt-1', 0)).toBe(true);
    expect(guard.allow('/details/trakt-2', 50)).toBe(true);
    expect(guard.allow('/person/1234', 80)).toBe(true);
  });

  test('a blocked push does not extend the window', () => {
    // Otherwise a finger resting on a card could keep the route locked out
    // indefinitely.
    const guard = createPushGuard();

    expect(guard.allow('/details/trakt-1', 0)).toBe(true);
    expect(guard.allow('/details/trakt-1', 400)).toBe(false);
    expect(guard.allow('/details/trakt-1', PUSH_GUARD_MS)).toBe(true);
  });

  test('returning to a route after visiting another is allowed immediately', () => {
    const guard = createPushGuard();

    expect(guard.allow('/details/trakt-1', 0)).toBe(true);
    expect(guard.allow('/details/trakt-2', 100)).toBe(true);
    // Only the *last* route is guarded — going back and forward between two
    // details screens is legitimate, however fast.
    expect(guard.allow('/details/trakt-1', 150)).toBe(true);
  });

  test('the window is configurable', () => {
    const guard = createPushGuard(100);

    expect(guard.allow('/details/trakt-1', 0)).toBe(true);
    expect(guard.allow('/details/trakt-1', 99)).toBe(false);
    expect(guard.allow('/details/trakt-1', 100)).toBe(true);
  });
});
