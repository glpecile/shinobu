import { defineRule } from '@oxlint/plugins';

import { nodeName } from '../utils.ts';

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Keep view-toggle sizing in explicit props rather than styling overrides.' },
    schema: [],
  },
  create(context) {
    const names = new Set<string>();
    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@/components/view-toggle') return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && nodeName(specifier.imported) === 'ViewToggle') names.add(specifier.local.name);
        }
      },
      JSXOpeningElement(node) {
        if (!names.has(nodeName(node.name) ?? '')) return;
        const attributes = node.attributes.filter((attribute) => attribute.type === 'JSXAttribute');
        if (!attributes.some((attribute) => nodeName(attribute.name) === 'size')) {
          context.report({ node, message: 'Choose ViewToggle size="sm" or size="md" to match its neighboring controls.' });
        }
        for (const attribute of attributes) {
          if (['className', 'style'].includes(nodeName(attribute.name) ?? '')) {
            context.report({ node: attribute, message: 'ViewToggle owns its spacing and dimensions. Use its size prop; position it with a wrapper.' });
          }
        }
      },
    };
  },
});
