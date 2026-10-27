import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('lint rejects Reanimated dependency arrays', () => {
  const diagnostics = lint('reanimated-no-deps', {
    'motion.tsx': `
      declare const useAnimatedStyle: any;
      declare const useAnimatedReaction: any;
      export const allowed = () => {
        useAnimatedStyle(() => ({}));
        useAnimatedReaction(() => 0, () => {});
      };
      export const rejected = (open: boolean) => {
        useAnimatedStyle(() => ({ opacity: open ? 1 : 0 }), [open]);
        useAnimatedReaction(() => 0, () => {}, [open]);
      };
    `,
  });
  expect(diagnostics).toHaveLength(2);
});
