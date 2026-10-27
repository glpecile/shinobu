import { defineRule } from '@oxlint/plugins';

import { nodeName } from '../utils.ts';

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Require easing curves supported by web layout animations.' },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === 'MemberExpression' && nodeName(callee.object) === 'Easing' && ['in', 'out', 'inOut'].includes(nodeName(callee.property) ?? '')) {
          context.report({
            node,
            message: 'Use Easing.bezier or a lib/motion token: Reanimated web layout animations run composed easings as linear.',
          });
        }
      },
    };
  },
});
