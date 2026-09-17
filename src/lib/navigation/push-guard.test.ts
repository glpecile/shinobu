import { describe, expect, test } from 'bun:test';

import { createPushGuard, PUSH_GUARD_MS } from './push-guard';

describe('createPushGuard', () => {
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
});
