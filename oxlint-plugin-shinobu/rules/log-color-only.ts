import { defineRule, type ESTree } from '@oxlint/plugins';

import { nodeName } from '../utils.ts';

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Reserve solid red action controls for logging.' },
    schema: [],
  },
  create(context) {
    const file = context.filename.replaceAll('\\', '/');
    if (!/\.[jt]sx?$/.test(file) || /\.test\.[jt]sx?$/.test(file)) return {};
    const logging = /\/src\/features\/log-media\//.test(file) || [
      '/src/features/episode-details/episode-log-button.tsx',
      '/src/features/episode-details/episode-actions-sheet.tsx',
      '/src/features/up-next/ui/quick-log-button.tsx',
      '/src/app/up-next-demo.tsx',
    ].some((path) => file.endsWith(path));
    const shared = ['/src/components/button.tsx', '/src/components/fab.tsx'].some((path) => file.endsWith(path));
    function check(node: ESTree.Node, value: unknown) {
      if (typeof value !== 'string') return;
      const rawRed = /#dc262[56]\b|rgb\(\s*220\s*[, ]\s*38\s*[, ]\s*3[78]\b/i.test(value) && node.parent?.type === 'Property' && nodeName(node.parent.key) === 'backgroundColor';
      const logToken = /--color-log\b|(?:^|[\s:])(?:bg|text|border|outline|ring|stroke|fill)-log(?:[\s/:-]|$)/.test(value);
      let parent = node.parent;
      while (parent != null && ['JSXExpressionContainer', 'ConditionalExpression', 'LogicalExpression', 'TSAsExpression'].includes(parent.type)) parent = parent.parent;
      let element = node.parent;
      while (element != null && element.type !== 'JSXOpeningElement') element = element.parent;
      const solidAccent = ['Button', 'Fab'].includes(element?.type === 'JSXOpeningElement' ? nodeName(element.name) ?? '' : '') && /(?:^|[\s:])bg-accent(?:\s|$)/.test(value);
      const logVariant = value === 'log' && parent?.type === 'JSXAttribute' && parent.name.name === 'variant';
      if (rawRed || (!logging && !shared && (logToken || logVariant || solidAccent))) {
        context.report({ node, message: 'Solid red action buttons are reserved for logging. Use a neutral button here; logging entry points use variant="log" and --color-log. Branding and softer red tints keep their existing colors.' });
      }
    }
    return {
      Literal(node) { check(node, node.value); },
      TemplateElement(node) { check(node, node.value.cooked); },
    };
  },
});
