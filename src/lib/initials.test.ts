import { expect, test } from 'bun:test';

import { initials } from './initials';

test('keeps an emoji whole and skips extra spaces', () => {
  expect(initials(' 🎬  aleksandra wiśniewska')).toBe('🎬A');
});
