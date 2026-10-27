import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('lint requires immediate presses for disclosures and preserves guarded actions', () => {
  const diagnostics = lint('immediate-disclosures', {
    'disclosure.tsx': `
      declare const PresstableOpacity: any;
      declare const PresstableScale: any;
      declare const PressableCard: any;
      declare const ActionableRow: any;
      declare const open: boolean;
      export const allowed = <>
        <PresstableOpacity accessibilityState={{ expanded: open }} pressBehavior="immediate" />
        <PressableCard accessibilityState={{ expanded: open }} pressBehavior={'immediate'} />
        <PresstableScale accessibilityState={{ selected: true }} />
        <PresstableOpacity pressBehavior="prevent-repeat" />
        <ActionableRow accessibility={{ accessibilityState: { expanded: open } }} pressBehavior="immediate" />
      </>;
      export const rejected = <>
        <PresstableOpacity accessibilityState={{ expanded: open }} />
        <PressableCard accessibilityState={{ expanded: false }} pressBehavior="prevent-repeat" />
        <PresstableScale aria-expanded={open} />
        <ActionableRow accessibility={{ accessibilityState: { expanded: false } }} />
      </>;
    `,
  });
  expect(diagnostics).toHaveLength(4);
});
