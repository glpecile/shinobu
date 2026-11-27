import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('hairlines and scrims use role tokens, not ad hoc alpha tints', () => {
  expect(
    lint('no-adhoc-tints', {
      'card.tsx': `<>
    <View className="border border-border/50" />
    <View className="bg-black/60" />
    <View className="border border-hairline bg-scrim web:hover:bg-border/40 bg-black" />
  </>`,
    }),
  ).toHaveLength(2);
});
