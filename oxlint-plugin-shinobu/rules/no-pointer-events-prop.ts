import { defineRule } from '@oxlint/plugins';

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Use style.pointerEvents rather than the deprecated prop.' },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name === 'pointerEvents') {
          context.report({
            node,
            message: 'Use style.pointerEvents instead; the pointerEvents prop is deprecated on React Native Web.',
          });
        }
      },
    };
  },
});
