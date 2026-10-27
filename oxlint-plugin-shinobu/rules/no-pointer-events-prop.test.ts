import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('pointer events belong in style rather than the deprecated prop', () => {
  expect(lint('no-pointer-events-prop', {
    'view.tsx': `<><View style={{ pointerEvents: 'none' }} /><View pointerEvents="none" /></>`,
  })).toHaveLength(1);
});
