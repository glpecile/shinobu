import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('class-name templates are rejected regardless of whitespace, without matching prose', () => {
  expect(lint('no-template-classnames', {
    'classes.tsx': `
      const allowed = <View className={cn('px-4', active && 'bg-accent')} />;
      const plain = <View className="px-4" />;
      const prose = 'className={\`px-4\`}';
      const rejected = <View className = {\`px-4 \${active}\`} contentContainerClassName={\`gap-2\`} />;
    `,
  })).toHaveLength(2);
});
