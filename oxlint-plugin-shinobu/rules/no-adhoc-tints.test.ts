import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('hairlines and scrims use role tokens, not ad hoc alpha tints', () => {
  expect(
    lint('no-adhoc-tints', {
      'card.tsx': `<>
    <View className="border border-border/50" />
    <View className="border-t border-t-border/50" />
    <View className="bg-black/60" />
    <View className="bg-black/[0.6]" />
    <View className="!bg-white/20" />
    <View className={\`bg-black\\/60\`} />
    <View className="border border-hairline bg-scrim web:hover:bg-border/40 bg-black" />
    <Text>{'Replace \`border-border/50\` with \`border-hairline\`'}</Text>
  </>`,
      'card.test.tsx': `<View className="bg-black/60" />`,
    }),
  ).toHaveLength(6);
});
