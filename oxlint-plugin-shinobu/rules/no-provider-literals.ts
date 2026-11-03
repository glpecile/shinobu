import { readFileSync } from 'node:fs';

import { defineRule } from '@oxlint/plugins';

// Read rather than imported: importing a src/ module makes Node warn that the
// app's package.json declares no module type.
const types = readFileSync(new URL('../../src/lib/providers/types.ts', import.meta.url), 'utf8');
const ids = new Set<unknown>(Array.from(types.match(/export const Provider = \{([^}]*)\}/)![1].matchAll(/'([^']+)'/g), (match) => match[1]));

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Spell provider ids as Provider.* from src/lib/providers/types.ts.' },
    schema: [],
  },
  create(context) {
    if (context.filename.endsWith('/src/lib/providers/types.ts') || /\.test\.tsx?$/.test(context.filename)) return {};
    return {
      Literal(node) {
        if (!ids.has(node.value)) return;
        context.report({ node, message: 'Use Provider.* from @/lib/providers/types, not a provider-id string literal; in a type, typeof Provider.*.' });
      },
    };
  },
});
