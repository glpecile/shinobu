import { defineRule } from '@oxlint/plugins';

import { nodeName } from '../utils.ts';

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Compose class names with cn() so conflicting utilities resolve consistently.' },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (!/className$/i.test(nodeName(node.name) ?? '')) return;
        if (node.value?.type === 'JSXExpressionContainer' && node.value.expression.type === 'TemplateLiteral') {
          context.report({ node: node.value, message: 'Compose class names with cn() from @/lib/cn instead of a template literal.' });
        }
      },
    };
  },
});
