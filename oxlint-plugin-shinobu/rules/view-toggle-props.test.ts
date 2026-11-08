import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('view toggles require an explicit size and reject styling overrides, including aliased imports', () => {
  const diagnostics = lint('view-toggle-props', {
    'toolbar.tsx': `
      import { ViewToggle as LayoutToggle } from '@/components/view-toggle';
      declare const size: 'sm' | 'md';
      export const allowed = <><LayoutToggle size="sm" /><LayoutToggle size={size} /></>;
      export const rejected = <>
        <LayoutToggle />
        <LayoutToggle size="sm" className="p-4 h-20" />
        <LayoutToggle size="md" style={{ padding: 16 }} />
      </>;
    `,
  });
  expect(diagnostics).toHaveLength(3);
});
