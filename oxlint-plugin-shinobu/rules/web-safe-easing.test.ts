import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('lint rejects composed easings and accepts bezier curves', () => {
  expect(lint('web-safe-easing', {
    'motion.ts': `Easing.bezier(0.5, 1, 0.89, 1); Easing.out(Easing.quad);`,
  })).toHaveLength(1);
});
