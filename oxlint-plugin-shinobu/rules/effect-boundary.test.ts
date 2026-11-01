import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('Effect imports are rejected outside the provider, HTTP and query layers and the write hooks', () => {
  expect(lint('effect-boundary', {
    'src/components/a.tsx': `import * as Effect from 'effect/Effect';`,
    'src/state/queries/b.ts': `import * as Effect from 'effect/Effect';`,
    'src/features/log-media/use-log-media.ts': `import * as Effect from 'effect/Effect';`,
  }).map((diagnostic) => diagnostic.filename)).toEqual([expect.stringMatching(/src\/components\/a\.tsx$/)]);
});
